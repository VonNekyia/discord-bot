import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { connect, type AddressInfo } from 'node:net';
import { after, before, describe, test, type TestContext } from 'node:test';
import { fileURLToPath } from 'node:url';
import { ChannelType, ClientUser, PermissionFlagsBits as R, type Client } from 'discord.js';
import type { Pool } from 'pg';
import { legeSitzungAn, raeumeAuf } from './anmeldung.js';
import { apiUmgebung, erstelleApi, Grenze } from './api.js';
import { behalteNur, speichere, standard, vergiss } from './begruessung.js';
import { erstelleClient } from './client.js';
import { migriere, oeffne, verbindung } from './datenbank.js';

// Gegen eine gemockte Discord-API und eine echte PostgreSQL; ohne DB_HOST
// übersprungen, in der CI immer dabei. Alle IDs sind erfunden.
// Siehe docs/entwicklung/tests.md, „Die API des Dashboards“.
const ziel = verbindung();
if (!ziel && process.env.CI) throw new Error('In der CI muss die Datenbank da sein: DB_* fehlt.');

const BOT = '100000000000000001';
const PERSON = '200000000000000002';
const FREMD = '200000000000000003';
const ANWENDUNG = '600000000000000001';
const SERVER = '300000000000000003';
const OHNE_BOT = '300000000000000004';
const EIGENER = '300000000000000005';
const NUR_MITGLIED = '300000000000000006';
const ANDERER_SHARD = '300000000004194307';
const ROLLE_BOT = '400000000000000001';
const ROLLE_TEAM = '400000000000000002';
const K = {
  infos: '500000000000000001',
  allgemein: '500000000000000002',
  ohne: '500000000000000010',
  neues: '500000000000000011',
  hallo: '500000000000000012',
  regeln: '500000000000000021',
  willkommen: '500000000000000020',
  versteckt: '500000000000000022',
  stimme: '500000000000000023',
};
const CODE = 'code-aus-discord-7f3a';
const TOKEN = 'zugang-aus-discord-91c2';
const GEHEIMNIS = 'geheimnis-der-anwendung-5d1e';
const DASHBOARD = 'http://localhost:4173';

function rolle(id: string, name: string, rechte: bigint, position: number) {
  return { id, name, permissions: String(rechte), position, color: 0, hoist: false, managed: false, mentionable: false, flags: 0 };
}

function kanal(id: string, type: ChannelType, name: string, position: number, parent_id: string | null, verboten = 0n) {
  const permission_overwrites = verboten ? [{ id: ROLLE_BOT, type: 0, allow: '0', deny: String(verboten) }] : [];
  return { id, type, name, position, parent_id, permission_overwrites };
}

function mitglied(id: string, roles: string[]) {
  return { user: { id, username: `nutzer-${id.slice(-2)}`, discriminator: '0', avatar: null }, roles, joined_at: '2026-01-01T00:00:00.000Z', deaf: false, mute: false, flags: 0 };
}

// Ein Server, wie GUILD_CREATE ihn bringt, mit dem Bot als Mitglied.
function gilde(id: string, name: string, eigentuemer: string, channels: object[] = []) {
  return {
    id,
    name,
    icon: null,
    owner_id: eigentuemer,
    features: [],
    emojis: [],
    stickers: [],
    roles: [
      rolle(id, '@everyone', 0n, 0),
      rolle(ROLLE_BOT, 'kitty', R.ViewChannel | R.SendMessages | R.AttachFiles, 1),
      rolle(ROLLE_TEAM, 'Team', R.ManageGuild, 2),
    ],
    channels,
    members: [mitglied(BOT, [ROLLE_BOT])],
  };
}

interface MockDiscord {
  url: string;
  anfragen: { methode: string; pfad: string; kopf: Record<string, string | string[] | undefined>; body: string }[];
  // `${server}/${nutzer}` → Mitglied oder Status.
  mitglieder: Map<string, object | number>;
  person: number;
}

// Gemockte Discord-API für OAuth2 und für Mitglieder.
async function mockDiscord(): Promise<MockDiscord & { server: Server }> {
  const mock = { anfragen: [], mitglieder: new Map(), person: 200 } as unknown as MockDiscord & { server: Server };
  mock.server = createServer((req, res) => {
    let body = '';
    req.on('data', (teil) => (body += teil));
    req.on('end', () => {
      const pfad = req.url ?? '';
      mock.anfragen.push({ methode: req.method ?? '', pfad, kopf: req.headers, body });
      const antworte = (status: number, wert: unknown) =>
        res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(wert));
      const basic = `Basic ${Buffer.from(`${ANWENDUNG}:${GEHEIMNIS}`).toString('base64')}`;
      const form = new URLSearchParams(body);
      if (pfad === '/api/v10/oauth2/token') {
        const passt = req.headers.authorization === basic && form.get('code') === CODE && form.get('grant_type') === 'authorization_code';
        return passt ? antworte(200, { access_token: TOKEN, token_type: 'Bearer', expires_in: 604800, scope: 'identify guilds' }) : antworte(400, { error: 'invalid_grant' });
      }
      if (pfad === '/api/v10/oauth2/token/revoke') return antworte(req.headers.authorization === basic ? 200 : 401, {});
      if (pfad.startsWith('/api/v10/users/@me') && req.headers.authorization !== `Bearer ${TOKEN}`) return antworte(401, {});
      if (pfad === '/api/v10/users/@me') {
        return mock.person === 200
          ? antworte(200, { id: PERSON, username: 'probe', global_name: 'Probe Person', avatar: 'abc123' })
          : antworte(mock.person, {});
      }
      if (pfad === '/api/v10/users/@me/guilds') {
        return antworte(200, [
          { id: SERVER, name: 'Probe', owner: false, permissions: String(R.ManageGuild) },
          { id: OHNE_BOT, name: 'Ohne Bot', owner: true, permissions: '0' },
          { id: EIGENER, name: 'Eigener', owner: false, permissions: String(R.Administrator) },
          { id: NUR_MITGLIED, name: 'Nur Mitglied', owner: false, permissions: String(R.SendMessages) },
        ]);
      }
      const treffer = /^\/api\/v10\/guilds\/(\d+)\/members\/(\d+)$/.exec(pfad);
      const eintrag = treffer && mock.mitglieder.get(`${treffer[1]}/${treffer[2]}`);
      if (typeof eintrag === 'object' && eintrag) return antworte(200, eintrag);
      if (eintrag === 500) return antworte(500, { message: 'Internal Server Error', code: 0 });
      return antworte(404, { message: 'Unknown Member', code: 10007 });
    });
  });
  await new Promise<void>((fertig) => mock.server.listen(0, '127.0.0.1', fertig));
  mock.url = `http://127.0.0.1:${(mock.server.address() as AddressInfo).port}`;
  return mock;
}

// Ein Client wie nach dem Start, ohne Gateway: Server im Cache, REST gegen den Mock.
function discordClient(api: string): Client {
  const client = erstelleClient({ rest: { api: `${api}/api`, retries: 0 } });
  client.rest.setToken('test');
  client.user = Reflect.construct(ClientUser, [client, { id: BOT, username: 'kitty', discriminator: '0', bot: true, avatar: null }]);
  const guilds = client.guilds as unknown as { _add(daten: unknown): unknown };
  guilds._add(
    gilde(SERVER, 'Probe', '200000000000000099', [
      kanal(K.infos, ChannelType.GuildCategory, 'Infos', 1, null),
      kanal(K.allgemein, ChannelType.GuildCategory, 'Allgemein', 0, null),
      kanal(K.ohne, ChannelType.GuildText, 'ohne-kategorie', 5, null),
      kanal(K.hallo, ChannelType.GuildText, 'hallo', 1, K.infos),
      kanal(K.neues, ChannelType.GuildAnnouncement, 'neues', 0, K.infos),
      kanal(K.willkommen, ChannelType.GuildText, 'willkommen', 0, K.allgemein),
      kanal(K.regeln, ChannelType.GuildText, 'regeln', 0, K.allgemein, R.AttachFiles),
      kanal(K.versteckt, ChannelType.GuildText, 'versteckt', 2, K.allgemein, R.ViewChannel),
      kanal(K.stimme, ChannelType.GuildVoice, 'stimme', 3, K.allgemein),
    ]),
  );
  guilds._add(gilde(EIGENER, 'Alpha', PERSON));
  return client;
}

// Eine Anfrage an die API, ohne Weiterleitungen zu folgen.
async function frage(basis: string, pfad: string, init: { method?: string; sitzung?: string; headers?: Record<string, string>; body?: string } = {}) {
  const headers: Record<string, string> = { ...init.headers };
  if (init.sitzung) headers.cookie = `sitzung=${init.sitzung}`;
  return fetch(`${basis}${pfad}`, { method: init.method ?? 'GET', headers, body: init.body, redirect: 'manual' });
}

// Schickt rohe Bytes und liest, bis der Server die Verbindung schliesst.
function roh(port: number, daten: string): Promise<string> {
  return new Promise((fertig, scheitern) => {
    const socket = connect(port, '127.0.0.1', () => socket.write(daten));
    let antwort = '';
    socket.on('data', (teil) => (antwort += teil));
    socket.on('end', () => fertig(antwort));
    socket.on('error', (fehler) => (antwort ? fertig(antwort) : scheitern(fehler)));
  });
}

test('apiUmgebung braucht Secret und Adresse des Dashboards', () => {
  assert.equal(apiUmgebung({ DASHBOARD_URL: DASHBOARD }), undefined);
  assert.equal(apiUmgebung({ DISCORD_CLIENT_SECRET: 'x' }), undefined);
  assert.deepEqual(apiUmgebung({ DISCORD_CLIENT_SECRET: 'x', DASHBOARD_URL: `${DASHBOARD}/` }), { geheimnis: 'x', dashboard: DASHBOARD, port: 4174 });
  assert.equal(apiUmgebung({ DISCORD_CLIENT_SECRET: 'x', DASHBOARD_URL: DASHBOARD, API_PORT: '5000' })?.port, 5000);
  assert.equal(apiUmgebung({ DISCORD_CLIENT_SECRET: 'x', DASHBOARD_URL: DASHBOARD, API_PORT: '' })?.port, 4174);
  assert.throws(() => apiUmgebung({ DISCORD_CLIENT_SECRET: 'x', DASHBOARD_URL: 'localhost:4173' }), /DASHBOARD_URL/);
  assert.throws(() => apiUmgebung({ DISCORD_CLIENT_SECRET: 'x', DASHBOARD_URL: DASHBOARD, API_PORT: '70000' }), /API_PORT/);
});

test('Grenze lässt 60 Anfragen je Minute zu und nennt die Sekunden bis zur nächsten', () => {
  let jetzt = 1_000_000;
  const grenze = new Grenze(60, 60_000, () => jetzt);
  for (let i = 0; i < 60; i++) {
    assert.equal(grenze.pruefe('a'), 0);
    jetzt += 100;
  }
  assert.equal(grenze.pruefe('a'), 54);
  assert.equal(grenze.pruefe('b'), 0);
  jetzt = 1_000_000 + 60_001;
  assert.equal(grenze.pruefe('a'), 0);
  jetzt += 120_000;
  grenze.raeume();
  assert.equal(grenze.pruefe('a'), 0);
});

describe('API des Dashboards', { skip: ziel ? false : 'keine Datenbank, DB_HOST fehlt' }, () => {
  let db: Pool;
  let mock: MockDiscord & { server: Server };
  let client: Client;
  let api: Server;
  let basis: string;
  let port: number;
  const verwalter = mitglied(PERSON, [ROLLE_TEAM]);

  before(async () => {
    if (!ziel) return;
    await migriere(ziel, fileURLToPath(new URL('../migrationen', import.meta.url)));
    db = oeffne(ziel);
    mock = await mockDiscord();
    client = discordClient(mock.url);
    api = erstelleApi({ client, db, anwendung: ANWENDUNG, geheimnis: GEHEIMNIS, dashboard: DASHBOARD, discord: `${mock.url}/api/v10` });
    await new Promise<void>((fertig) => api.listen(0, '127.0.0.1', fertig));
    port = (api.address() as AddressInfo).port;
    basis = `http://127.0.0.1:${port}`;
  });

  after(async () => {
    if (!ziel) return;
    await db.query('DELETE FROM sitzungen WHERE nutzer = ANY($1)', [[PERSON, FREMD]]);
    await db.query('DELETE FROM begruessungen WHERE server = ANY($1)', [[SERVER, EIGENER, ANDERER_SHARD]]);
    api.closeAllConnections();
    await new Promise((fertig) => api.close(fertig));
    mock.server.closeAllConnections();
    await new Promise((fertig) => mock.server.close(fertig));
    await client.destroy();
    await db.end();
  });

  // Eine frische Sitzung, wie nach der Anmeldung.
  async function sitzung(nutzer = PERSON): Promise<string> {
    mock.mitglieder.set(`${SERVER}/${nutzer}`, mitglied(nutzer, [ROLLE_TEAM]));
    return legeSitzungAn(db, { nutzer, name: 'Probe Person', avatar: 'abc123', server: [SERVER, OHNE_BOT, EIGENER] });
  }

  const mitgliederAbrufe = () => mock.anfragen.filter((a) => a.pfad.includes('/members/')).length;

  describe('Anmeldung', () => {
    test('anmelden setzt ein state-Cookie und leitet zu Discord', async () => {
      const antwort = await frage(basis, '/api/anmelden');
      assert.equal(antwort.status, 302);
      const ort = new URL(antwort.headers.get('location') ?? '');
      assert.equal(`${ort.origin}${ort.pathname}`, 'https://discord.com/oauth2/authorize');
      const state = ort.searchParams.get('state') ?? '';
      assert.match(state, /^[A-Za-z0-9_-]{43}$/);
      assert.deepEqual(Object.fromEntries(ort.searchParams), {
        response_type: 'code',
        client_id: ANWENDUNG,
        scope: 'identify guilds',
        redirect_uri: `${DASHBOARD}/api/anmelden/zurueck`,
        state,
      });
      assert.deepEqual(antwort.headers.getSetCookie(), [`anmeldung=${state}; Path=/api/anmelden; Max-Age=600; HttpOnly; SameSite=Lax`]);
    });

    test('ohne state-Cookie oder mit falschem state fragt der Bot Discord nicht', async () => {
      const vorher = mock.anfragen.length;
      for (const cookie of [undefined, 'anmeldung=falsch-falsch-falsch-falsch-falsch-falsch-fal']) {
        const antwort = await frage(basis, `/api/anmelden/zurueck?code=${CODE}&state=richtig-richtig-richtig-richtig-richtig-richti`, {
          headers: cookie ? { cookie } : {},
        });
        assert.equal(antwort.status, 302);
        assert.equal(antwort.headers.get('location'), '/dashboard/?fehler=anmeldung');
        assert.deepEqual(antwort.headers.getSetCookie(), ['anmeldung=; Path=/api/anmelden; Max-Age=0; HttpOnly; SameSite=Lax']);
      }
      assert.equal(mock.anfragen.length, vorher);
    });

    test('die Anmeldung tauscht den Code, widerruft den Token und legt eine Sitzung an', async () => {
      const state = 's'.repeat(43);
      const vorher = mock.anfragen.length;
      const antwort = await frage(basis, `/api/anmelden/zurueck?code=${CODE}&state=${state}`, { headers: { cookie: `anmeldung=${state}` } });
      assert.equal(antwort.status, 302);
      assert.equal(antwort.headers.get('location'), '/dashboard/');
      const [sitzungsCookie, weg] = antwort.headers.getSetCookie();
      const kennung = /^sitzung=([A-Za-z0-9_-]{43}); Path=\/; Max-Age=604800; HttpOnly; SameSite=Lax$/.exec(sitzungsCookie ?? '')?.[1];
      assert.ok(kennung, sitzungsCookie);
      assert.equal(weg, 'anmeldung=; Path=/api/anmelden; Max-Age=0; HttpOnly; SameSite=Lax');

      const aufrufe = mock.anfragen.slice(vorher).map((a) => `${a.methode} ${a.pfad}`);
      assert.deepEqual(aufrufe, [
        'POST /api/v10/oauth2/token',
        'GET /api/v10/users/@me',
        'GET /api/v10/users/@me/guilds',
        'POST /api/v10/oauth2/token/revoke',
      ]);
      const tausch = new URLSearchParams(mock.anfragen[vorher]?.body);
      assert.equal(tausch.get('redirect_uri'), `${DASHBOARD}/api/anmelden/zurueck`);
      assert.equal(new URLSearchParams(mock.anfragen.at(-1)?.body).get('token'), TOKEN);

      const hash = createHash('sha256').update(Buffer.from(kennung, 'base64url')).digest();
      const { rows } = await db.query<{ server: string[]; ablauf: Date }>('SELECT server, ablauf FROM sitzungen WHERE kennung = $1', [hash]);
      assert.deepEqual(rows[0]?.server, [SERVER, OHNE_BOT, EIGENER]);
      const tage = ((rows[0]?.ablauf.getTime() ?? 0) - Date.now()) / 86_400_000;
      assert.ok(Math.abs(tage - 7) < 0.01, String(tage));

      const ich = await frage(basis, '/api/ich', { sitzung: kennung });
      assert.deepEqual(await ich.json(), {
        id: PERSON,
        name: 'Probe Person',
        avatar: `https://cdn.discordapp.com/avatars/${PERSON}/abc123.webp?size=128`,
      });
      const server = await frage(basis, '/api/server', { sitzung: kennung });
      assert.deepEqual(await server.json(), [
        { id: EIGENER, name: 'Alpha', icon: null },
        { id: SERVER, name: 'Probe', icon: null },
      ]);
    });

    test('der Token wird auch widerrufen, wenn das Lesen der Person scheitert', async (t) => {
      const log = t.mock.method(console, 'error', () => {});
      mock.person = 500;
      t.after(() => (mock.person = 200));
      const { rows: vorher } = await db.query('SELECT count(*)::int AS n FROM sitzungen');
      const state = 't'.repeat(43);
      const antwort = await frage(basis, `/api/anmelden/zurueck?code=${CODE}&state=${state}`, { headers: { cookie: `anmeldung=${state}` } });
      assert.equal(antwort.headers.get('location'), '/dashboard/?fehler=anmeldung');
      assert.equal(mock.anfragen.at(-1)?.pfad, '/api/v10/oauth2/token/revoke');
      assert.deepEqual(log.mock.calls.map((c) => String(c.arguments[0])), ['Anmeldung: Person: Discord antwortet 500']);
      const { rows: nachher } = await db.query('SELECT count(*)::int AS n FROM sitzungen');
      assert.equal(nachher[0].n, vorher[0].n);
    });

    test('mit https tragen die Cookies Secure', async () => {
      const sicher = erstelleApi({ client, db, anwendung: ANWENDUNG, geheimnis: GEHEIMNIS, dashboard: 'https://dashboard.example', discord: `${mock.url}/api/v10` });
      await new Promise<void>((fertig) => sicher.listen(0, '127.0.0.1', fertig));
      try {
        const antwort = await frage(`http://127.0.0.1:${(sicher.address() as AddressInfo).port}`, '/api/anmelden');
        assert.match(antwort.headers.getSetCookie()[0] ?? '', /; HttpOnly; SameSite=Lax; Secure$/);
      } finally {
        sicher.closeAllConnections();
        await new Promise((fertig) => sicher.close(fertig));
      }
    });

    test('abmelden braucht den Origin des Dashboards und löscht die Sitzung', async () => {
      const kennung = await sitzung();
      for (const headers of [{}, { origin: 'https://boese.example' }] as Record<string, string>[]) {
        const antwort = await frage(basis, '/api/abmelden', { method: 'POST', sitzung: kennung, headers });
        assert.equal(antwort.status, 403);
        assert.deepEqual(await antwort.json(), { code: 'origin_falsch' });
      }
      const antwort = await frage(basis, '/api/abmelden', { method: 'POST', sitzung: kennung, headers: { origin: DASHBOARD } });
      assert.equal(antwort.status, 204);
      assert.deepEqual(antwort.headers.getSetCookie(), ['sitzung=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax']);
      assert.equal((await frage(basis, '/api/ich', { sitzung: kennung })).status, 401);
    });

    test('eine abgelaufene Sitzung gilt nicht, und raeumeAuf löscht sie', async () => {
      const kennung = await sitzung();
      const hash = createHash('sha256').update(Buffer.from(kennung, 'base64url')).digest();
      await db.query("UPDATE sitzungen SET ablauf = now() - interval '1 second' WHERE kennung = $1", [hash]);
      const antwort = await frage(basis, '/api/ich', { sitzung: kennung });
      assert.equal(antwort.status, 401);
      assert.deepEqual(await antwort.json(), { code: 'nicht_angemeldet' });
      await raeumeAuf(db);
      assert.equal((await db.query('SELECT 1 FROM sitzungen WHERE kennung = $1', [hash])).rowCount, 0);
    });
  });

  describe('Rechte und Grenzen', () => {
    test('Bot nicht auf dem Server gibt 404, kein Mitglied und Recht entzogen geben 403', async () => {
      const kennung = await sitzung();
      const vorher = mitgliederAbrufe();
      const ohneBot = await frage(basis, `/api/server/${OHNE_BOT}/kanaele`, { sitzung: kennung });
      assert.equal(ohneBot.status, 404);
      assert.deepEqual(await ohneBot.json(), { code: 'nicht_gefunden' });
      assert.equal(mitgliederAbrufe(), vorher);

      const keinMitglied = await frage(basis, `/api/server/${SERVER}/kanaele`, { sitzung: await legeSitzungAn(db, { nutzer: FREMD, name: 'x', avatar: null, server: [] }) });
      assert.equal(keinMitglied.status, 403);
      assert.deepEqual(await keinMitglied.json(), { code: 'kein_recht' });

      assert.equal((await frage(basis, `/api/server/${SERVER}/begruessung`, { sitzung: kennung })).status, 200);
      mock.mitglieder.set(`${SERVER}/${PERSON}`, mitglied(PERSON, []));
      const entzogen = await frage(basis, `/api/server/${SERVER}/begruessung`, { sitzung: kennung });
      assert.equal(entzogen.status, 403);
      assert.deepEqual(await entzogen.json(), { code: 'kein_recht' });

      mock.mitglieder.set(`${EIGENER}/${PERSON}`, mitglied(PERSON, []));
      assert.equal((await frage(basis, `/api/server/${EIGENER}/kanaele`, { sitzung: kennung })).status, 200);
    });

    test('nach 60 Anfragen je Minute kommt 429 mit Retry-After, ohne Discord zu fragen', async () => {
      const kennung = await sitzung();
      const vorher = mitgliederAbrufe();
      for (let i = 0; i < 60; i++) assert.equal((await frage(basis, `/api/server/${SERVER}/kanaele`, { sitzung: kennung })).status, 200);
      const antwort = await frage(basis, `/api/server/${SERVER}/kanaele`, { sitzung: kennung });
      assert.equal(antwort.status, 429);
      assert.deepEqual(await antwort.json(), { code: 'zu_viele' });
      const warten = Number(antwort.headers.get('retry-after'));
      assert.ok(warten >= 1 && warten <= 60, String(warten));
      assert.equal(mitgliederAbrufe(), vorher + 60);
      assert.equal((await frage(basis, '/api/ich', { sitzung: kennung })).status, 200);
    });

    test('antwortet Discord nicht, gibt es 503 und eine Logzeile ohne IDs', async (t) => {
      const log = t.mock.method(console, 'error', () => {});
      const kennung = await sitzung();
      mock.mitglieder.set(`${SERVER}/${PERSON}`, 500);
      t.after(() => mock.mitglieder.set(`${SERVER}/${PERSON}`, verwalter));
      const antwort = await frage(basis, `/api/server/${SERVER}/kanaele`, { sitzung: kennung });
      assert.equal(antwort.status, 503);
      assert.deepEqual(await antwort.json(), { code: 'nicht_erreichbar' });
      const zeilen = log.mock.calls.map((c) => String(c.arguments[0]));
      assert.equal(zeilen.length, 1);
      assert.match(zeilen[0] ?? '', /^API kanaele: /);
      assert.doesNotMatch(zeilen[0] ?? '', /\d{17}/);
    });
  });

  describe('Kanäle und Begrüssung', () => {
    test('kanaele liefert Text- und Ankündigungskanäle, sortiert wie in Discord', async () => {
      const antwort = await frage(basis, `/api/server/${SERVER}/kanaele`, { sitzung: await sitzung() });
      assert.equal(antwort.headers.get('cache-control'), 'no-store');
      assert.equal(antwort.headers.get('x-content-type-options'), 'nosniff');
      const allgemein = { id: K.allgemein, name: 'Allgemein' };
      const infos = { id: K.infos, name: 'Infos' };
      assert.deepEqual(await antwort.json(), [
        { id: K.ohne, name: 'ohne-kategorie', banner: true, kategorie: null },
        { id: K.willkommen, name: 'willkommen', banner: true, kategorie: allgemein },
        { id: K.regeln, name: 'regeln', banner: false, kategorie: allgemein },
        { id: K.neues, name: 'neues', banner: true, kategorie: infos },
        { id: K.hallo, name: 'hallo', banner: true, kategorie: infos },
      ]);
    });

    test('begruessung liefert Standardwerte, speichert und liefert, was gespeichert ist', async () => {
      const kennung = await sitzung();
      const leer = await (await frage(basis, `/api/server/${SERVER}/begruessung`, { sitzung: kennung })).json();
      assert.deepEqual(leer, {
        beitritt: { an: false, kanal: null, text: 'Willkommen auf {server}, {nutzer}!', banner: false, bannerText: 'Willkommen, {name}!', bild: false },
        abschied: { an: false, kanal: null, text: '{name} hat den Server verlassen.', banner: false, bannerText: 'Tschüss, {name}!', bild: false },
      });
      const neu = { an: true, kanal: K.willkommen, text: `{server}${'x'.repeat(1800)}`, banner: false, bannerText: 'Hallo {name}' };
      const kopf = { origin: DASHBOARD, 'content-type': 'application/json' };
      const antwort = await frage(basis, `/api/server/${SERVER}/begruessung/abschied`, { method: 'PUT', sitzung: kennung, headers: kopf, body: JSON.stringify(neu) });
      assert.equal(antwort.status, 200);
      assert.deepEqual(await antwort.json(), { ...neu, bild: false });
      const gelesen = (await (await frage(basis, `/api/server/${SERVER}/begruessung`, { sitzung: kennung })).json()) as { abschied: unknown };
      assert.deepEqual(gelesen.abschied, { ...neu, bild: false });
    });

    test('Speichern prüft Origin, Content-Type und Regeln', async () => {
      const kennung = await sitzung();
      const pfad = `/api/server/${SERVER}/begruessung/beitritt`;
      const gut = { an: false, kanal: null, text: 'Hallo', banner: false, bannerText: 'Hallo' };
      const put = (headers: Record<string, string>, body: unknown) =>
        frage(basis, pfad, { method: 'PUT', sitzung: kennung, headers, body: typeof body === 'string' ? body : JSON.stringify(body) });
      const json = { origin: DASHBOARD, 'content-type': 'application/json; charset=utf-8' };
      const faelle: [Record<string, string>, unknown, number, unknown][] = [
        [{ 'content-type': 'application/json' }, gut, 403, { code: 'origin_falsch' }],
        [{ ...json, origin: 'http://localhost:9999' }, gut, 403, { code: 'origin_falsch' }],
        [{ origin: DASHBOARD }, gut, 415, { code: 'kein_json' }],
        [{ origin: DASHBOARD, 'content-type': 'text/plain' }, gut, 415, { code: 'kein_json' }],
        [json, '{kaputt', 400, { code: 'ungueltig', feld: 'an' }],
        [json, { ...gut, kanal: K.versteckt }, 400, { code: 'kanal_unbekannt', feld: 'kanal' }],
        [json, { ...gut, text: `{server}${'x'.repeat(1801)}` }, 400, { code: 'text_zu_lang', feld: 'text' }],
        [json, { ...gut, kanal: K.willkommen, banner: true }, 400, { code: 'banner_ohne_bild', feld: 'banner' }],
        [json, { ...gut, an: true }, 400, { code: 'an_ohne_kanal', feld: 'an' }],
        [json, gut, 200, { ...gut, bild: false }],
      ];
      for (const [headers, body, status, erwartet] of faelle) {
        const antwort = await put(headers, body);
        assert.equal(antwort.status, status, JSON.stringify(headers));
        assert.deepEqual(await antwort.json(), erwartet);
      }
    });

    test('ein Body über 16 KiB gibt 413, ohne ihn ganz zu lesen', { timeout: 5_000 }, async () => {
      const kennung = await sitzung();
      const kopf = `PUT /api/server/${SERVER}/begruessung/beitritt HTTP/1.1\r\nHost: localhost\r\nOrigin: ${DASHBOARD}\r\nCookie: sitzung=${kennung}\r\nContent-Type: application/json\r\n`;
      // Content-Length über der Grenze, ohne Body: Der Server wartet nicht darauf.
      assert.match(await roh(port, `${kopf}Content-Length: 1000000\r\n\r\n`), /^HTTP\/1\.1 413 [^]*\r\n\r\n\{"code":"zu_gross"\}$/);
      // Chunked, 16 KiB und ein Byte, ohne Ende: Der Server hört nach der Grenze auf.
      const stueck = 'x'.repeat(16 * 1024 + 1);
      const antwort = await roh(port, `${kopf}Transfer-Encoding: chunked\r\n\r\n${stueck.length.toString(16)}\r\n${stueck}\r\n`);
      assert.match(antwort, /^HTTP\/1\.1 413 /);
      assert.match(antwort, /\r\nConnection: close\r\n/i);
    });

    test('verlässt der Bot einen Server, gehen dessen Einstellungen, auch beim Abgleich nach dem Start', async () => {
      const zahl = async (server: string) => (await db.query('SELECT 1 FROM begruessungen WHERE server = $1', [server])).rowCount;
      await speichere(db, SERVER, 'beitritt', standard('beitritt'));
      await speichere(db, EIGENER, 'abschied', standard('abschied'));
      await vergiss(db, SERVER);
      assert.equal(await zahl(SERVER), 0);
      assert.equal(await zahl(EIGENER), 1);
      // Alle anderen Server bleiben; so löscht der Test keine fremden Zeilen der Dev-Datenbank.
      const andere = await db.query<{ server: string }>('SELECT DISTINCT server FROM begruessungen WHERE server <> $1', [EIGENER]);
      assert.equal(await behalteNur(db, andere.rows.map((z) => z.server)), 1);
      assert.equal(await zahl(EIGENER), 0);
    });

    test('mit dem ShardingManager gleicht ein Prozess nur unter den Servern seiner Shards ab', async () => {
      const shard = (id: string) => Number((BigInt(id) >> 22n) % 2n);
      assert.deepEqual([shard(EIGENER), shard(ANDERER_SHARD)], [0, 1]);
      const zahl = async (server: string) => (await db.query('SELECT 1 FROM begruessungen WHERE server = $1', [server])).rowCount;
      await speichere(db, EIGENER, 'beitritt', standard('beitritt'));
      await speichere(db, ANDERER_SHARD, 'beitritt', standard('beitritt'));
      const andere = await db.query<{ server: string }>(
        'SELECT DISTINCT server FROM begruessungen WHERE server <> ALL($1)',
        [[EIGENER, ANDERER_SHARD]],
      );
      // Der Prozess mit Shard 1 von 2 kennt keinen der beiden; EIGENER liegt auf Shard 0 und bleibt.
      assert.equal(await behalteNur(db, andere.rows.map((z) => z.server), { ids: [1], count: 2 }), 1);
      assert.equal(await zahl(EIGENER), 1);
      assert.equal(await zahl(ANDERER_SHARD), 0);
    });

    test('unbekannte Routen, Arten und die Routen für Bilder geben 404', async () => {
      const kennung = await sitzung();
      for (const [method, pfad] of [
        ['GET', '/api/gibt-es-nicht'],
        ['GET', '/api/server/abc/kanaele'],
        ['PUT', `/api/server/${SERVER}/begruessung/geburtstag`],
        ['PUT', `/api/server/${SERVER}/begruessung/beitritt/bild`],
        ['DELETE', `/api/server/${SERVER}/begruessung/beitritt/bild`],
        ['GET', `/api/server/${SERVER}/begruessung/beitritt/vorschau`],
        ['DELETE', '/api/ich'],
      ] as const) {
        const antwort = await frage(basis, pfad, { method, sitzung: kennung, headers: { origin: DASHBOARD } });
        assert.equal(antwort.status, 404, `${method} ${pfad}`);
        assert.deepEqual(await antwort.json(), { code: 'nicht_gefunden' });
      }
    });
  });

  test('kein Code, Token, Cookie, state und keine ID im Log', async (t: TestContext) => {
    const zeilen: string[] = [];
    for (const art of ['log', 'error', 'warn', 'info'] as const) {
      t.mock.method(console, art, (...teile: unknown[]) => zeilen.push(teile.map(String).join(' ')));
    }
    const state = 'u'.repeat(43);
    const anmelden = await frage(basis, `/api/anmelden/zurueck?code=${CODE}&state=${state}`, { headers: { cookie: `anmeldung=${state}` } });
    const kennung = /^sitzung=([^;]+)/.exec(anmelden.headers.getSetCookie()[0] ?? '')?.[1] ?? '';
    assert.ok(kennung);
    mock.person = 500;
    await frage(basis, `/api/anmelden/zurueck?code=${CODE}&state=${state}`, { headers: { cookie: `anmeldung=${state}` } });
    mock.person = 200;
    await frage(basis, `/api/anmelden/zurueck?code=falsch&state=${state}`, { headers: { cookie: `anmeldung=${state}` } });
    await frage(basis, `/api/anmelden/zurueck?state=${state}`, { headers: { cookie: 'anmeldung=anders' } });
    mock.mitglieder.set(`${SERVER}/${PERSON}`, 500);
    await frage(basis, `/api/server/${SERVER}/kanaele`, { sitzung: kennung });
    mock.mitglieder.set(`${SERVER}/${PERSON}`, verwalter);

    assert.ok(zeilen.length >= 4, zeilen.join('\n'));
    const geheim = [CODE, TOKEN, GEHEIMNIS, state, kennung, PERSON, SERVER, ANWENDUNG, 'Probe Person'];
    for (const zeile of zeilen) for (const wert of geheim) assert.ok(!zeile.includes(wert), `${wert} in: ${zeile}`);
  });
});
