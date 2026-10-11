import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, test, type TestContext } from 'node:test';
import { fileURLToPath } from 'node:url';
import type { Client } from 'discord.js';
import type { Pool } from 'pg';
import { legeSitzungAn, raeumeAuf } from './anmeldung.js';
import { apiUmgebung, erstelleApi, Grenze } from './api.js';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { bereiteVor, masse } from './banner.js';
import { behalteNur, vergiss } from './aufraeumen.js';
import { speichere, speichereBild, standard, type Einstellung } from './begruessung.js';
import { migriere, oeffne, verbindung } from './datenbank.js';
import {
  ANWENDUNG,
  ChannelType,
  CODE,
  DASHBOARD,
  discordClient,
  frage,
  gifBild,
  GEHEIMNIS,
  gilde,
  jpegMitExif,
  kanal,
  mitglied,
  mockDiscord,
  PERSON,
  pngBild,
  pngKopf,
  R,
  roh,
  ROLLE_TEAM,
  schliesse,
  svgBild,
  TOKEN,
  type MockDiscord,
} from './testhilfe.js';

// Gegen eine gemockte Discord-API und eine echte PostgreSQL; ohne DB_HOST
// übersprungen, in der CI immer dabei. Alle IDs sind erfunden.
// Siehe docs/entwicklung/tests.md, „Die API des Dashboards“.
const ziel = verbindung();
if (!ziel && process.env.CI) throw new Error('In der CI muss die Datenbank da sein: DB_* fehlt.');

const FREMD = '200000000000000003';
const SERVER = '300000000000000003';
const OHNE_BOT = '300000000000000004';
const EIGENER = '300000000000000005';
const NUR_MITGLIED = '300000000000000006';
const ANDERER_SHARD = '300000000004194307';
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

const gilden = [
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
  gilde(EIGENER, 'Alpha', PERSON),
];

const meineServer = [
  { id: SERVER, name: 'Probe', owner: false, permissions: String(R.ManageGuild) },
  { id: OHNE_BOT, name: 'Ohne Bot', owner: true, permissions: '0' },
  { id: EIGENER, name: 'Eigener', owner: false, permissions: String(R.Administrator) },
  { id: NUR_MITGLIED, name: 'Nur Mitglied', owner: false, permissions: String(R.SendMessages) },
];

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
  let mock: MockDiscord;
  // Server, deren Einstellungen die API im Cache gelöscht hat.
  const geleert: string[] = [];
  // Die Uhr der Grenzen; ein Test rückt sie vor.
  let jetzt = Date.now();
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
    mock.meineServer = meineServer;
    client = discordClient(mock, gilden);
    api = erstelleApi({
      client,
      db,
      anwendung: ANWENDUNG,
      geheimnis: GEHEIMNIS,
      dashboard: DASHBOARD,
      discord: `${mock.url}/api/v10`,
      einstellungen: { delete: (server) => geleert.push(server) },
      uhr: () => jetzt,
    });
    await new Promise<void>((fertig) => api.listen(0, '127.0.0.1', fertig));
    port = (api.address() as AddressInfo).port;
    basis = `http://127.0.0.1:${port}`;
  });

  after(async () => {
    if (!ziel) return;
    await db.query('DELETE FROM sitzungen WHERE nutzer = ANY($1)', [[PERSON, FREMD]]);
    await db.query('DELETE FROM begruessungen WHERE server = ANY($1)', [[SERVER, EIGENER, ANDERER_SHARD]]);
    await db.query('DELETE FROM bilder WHERE server = ANY($1)', [[SERVER, EIGENER, ANDERER_SHARD]]);
    api.closeAllConnections();
    await new Promise((fertig) => api.close(fertig));
    await schliesse(mock);
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
        // Das CDN zeigt im Test auf den Mock.
        avatar: `${mock.url}/cdn/avatars/${PERSON}/abc123.webp?size=128`,
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

    test('verlässt der Bot einen Server, gehen Einstellungen und Bilder, auch beim Abgleich nach dem Start', async () => {
      const zahl = async (server: string) =>
        (await db.query('SELECT (SELECT count(*) FROM begruessungen WHERE server = $1) + (SELECT count(*) FROM bilder WHERE server = $1) AS n', [server])).rows[0].n;
      const bild = pngBild(10, 10);
      for (const server of [SERVER, EIGENER]) {
        await speichere(db, server, 'beitritt', standard('beitritt'));
        await speichereBild(db, server, 'beitritt', bild);
      }
      await vergiss(db, SERVER);
      assert.equal(await zahl(SERVER), '0');
      assert.equal(await zahl(EIGENER), '2');
      // In einer Transaktion, die zurückrollt: Die Dev-Datenbank verliert nichts,
      // und Zeilen anderer Testdateien, die währenddessen entstehen, bleiben.
      const verbindung = await db.connect();
      try {
        await verbindung.query('BEGIN');
        const andere = await verbindung.query<{ server: string }>(
          'SELECT server FROM begruessungen WHERE server <> $1 UNION SELECT server FROM bilder WHERE server <> $1',
          [EIGENER],
        );
        assert.ok((await behalteNur(verbindung, andere.rows.map((z) => z.server))) >= 1);
        const { rows } = await verbindung.query(
          'SELECT (SELECT count(*) FROM begruessungen WHERE server = $1) + (SELECT count(*) FROM bilder WHERE server = $1) AS n',
          [EIGENER],
        );
        assert.equal(rows[0].n, '0');
      } finally {
        await verbindung.query('ROLLBACK');
        verbindung.release();
      }
    });

    test('mit dem ShardingManager gleicht ein Prozess nur unter den Servern seiner Shards ab', async () => {
      const shard = (id: string) => Number((BigInt(id) >> 22n) % 2n);
      assert.deepEqual([shard(EIGENER), shard(ANDERER_SHARD)], [0, 1]);
      for (const server of [EIGENER, ANDERER_SHARD]) {
        await speichere(db, server, 'beitritt', standard('beitritt'));
        await speichereBild(db, server, 'beitritt', pngBild(10, 10));
      }
      const verbindung = await db.connect();
      try {
        await verbindung.query('BEGIN');
        const andere = await verbindung.query<{ server: string }>(
          'SELECT server FROM begruessungen WHERE server <> ALL($1) UNION SELECT server FROM bilder WHERE server <> ALL($1)',
          [[EIGENER, ANDERER_SHARD]],
        );
        // Der Prozess mit Shard 1 von 2 kennt keinen der beiden; EIGENER liegt auf Shard 0 und bleibt.
        assert.ok((await behalteNur(verbindung, andere.rows.map((z) => z.server), { ids: [1], count: 2 })) >= 1);
        const zahl = async (server: string) =>
          (await verbindung.query('SELECT (SELECT count(*) FROM begruessungen WHERE server = $1) + (SELECT count(*) FROM bilder WHERE server = $1) AS n', [server])).rows[0].n;
        assert.equal(await zahl(EIGENER), '2');
        assert.equal(await zahl(ANDERER_SHARD), '0');
      } finally {
        await verbindung.query('ROLLBACK');
        verbindung.release();
      }
    });

    test('unbekannte Routen, Arten und Methoden geben 404', async () => {
      const kennung = await sitzung();
      for (const [method, pfad] of [
        ['GET', '/api/gibt-es-nicht'],
        ['GET', '/api/server/abc/kanaele'],
        ['PUT', `/api/server/${SERVER}/begruessung/geburtstag`],
        ['POST', `/api/server/${SERVER}/begruessung/beitritt/bild`],
        ['GET', `/api/server/${SERVER}/begruessung/beitritt/bild`],
        ['DELETE', '/api/ich'],
      ] as const) {
        const antwort = await frage(basis, pfad, { method, sitzung: kennung, headers: { origin: DASHBOARD } });
        assert.equal(antwort.status, 404, `${method} ${pfad}`);
        assert.deepEqual(await antwort.json(), { code: 'nicht_gefunden' });
      }
    });
  });

  describe('Bilder und Vorschau', () => {
    const pfad = `/api/server/${SERVER}/begruessung/beitritt`;
    const hoch = (kennung: string, typ: string, body: Buffer) =>
      frage(basis, `${pfad}/bild`, { method: 'PUT', sitzung: kennung, headers: { origin: DASHBOARD, 'content-type': typ }, body });
    const json = { origin: DASHBOARD, 'content-type': 'application/json' };

    test('ein Bild wird geprüft, bevor es dekodiert wird', async () => {
      const kennung = await sitzung();
      await db.query('DELETE FROM bilder WHERE server = $1', [SERVER]);
      const faelle: [string, Buffer, number, string][] = [
        ['image/gif', pngBild(300, 300), 415, 'bildtyp'],
        // Nur der Kopf: Würde der Bot zuerst dekodieren, käme bild_unlesbar.
        ['image/png', pngKopf(20000, 20000), 413, 'bild_zu_gross'],
        ['image/png', pngKopf(4097, 300), 413, 'bild_zu_gross'],
        ['image/png', pngBild(199, 300), 400, 'bild_zu_klein'],
        ['image/png', Buffer.from('kein Bild'), 415, 'bild_unlesbar'],
        ['image/png', pngKopf(500, 500), 415, 'bild_unlesbar'],
        // Lesbar für @napi-rs/canvas, aber nicht PNG, JPEG oder WebP: an der Signatur abgewiesen.
        ['image/png', svgBild(), 415, 'bild_unlesbar'],
        ['image/png', gifBild(), 415, 'bild_unlesbar'],
      ];
      for (const [typ, body, status, code] of faelle) {
        const antwort = await hoch(kennung, typ, body);
        assert.equal(antwort.status, status, code);
        assert.deepEqual(await antwort.json(), { code });
      }
      assert.equal((await db.query('SELECT 1 FROM bilder WHERE server = $1', [SERVER])).rowCount, 0);
    });

    test('ein Bild über 4 MiB gibt 413, ohne es zu lesen', { timeout: 5_000 }, async () => {
      const kennung = await sitzung();
      const antwort = await roh(
        port,
        `PUT ${pfad}/bild HTTP/1.1\r\nHost: localhost\r\nOrigin: ${DASHBOARD}\r\nCookie: sitzung=${kennung}\r\nContent-Type: image/png\r\nContent-Length: 4194305\r\n\r\n`,
      );
      assert.match(antwort, /^HTTP\/1\.1 413 [^]*\{"code":"bild_zu_gross"\}$/);
    });

    test('ein JPEG mit GPS wird gedreht, auf 1100 × 440 zugeschnitten und ohne Metadaten gespeichert', async () => {
      const kennung = await sitzung();
      geleert.length = 0;
      const jpeg = await jpegMitExif(1000, 400, 'GEHEIMER-ORT');
      assert.ok(jpeg.includes('GEHEIMER-ORT') && jpeg.includes('Exif'));
      assert.equal((await hoch(kennung, 'image/jpeg', jpeg)).status, 204);
      assert.deepEqual(geleert, [SERVER]);

      const { rows } = await db.query<{ daten: Buffer }>('SELECT daten FROM bilder WHERE server = $1 AND art = $2', [SERVER, 'beitritt']);
      const daten = rows[0]?.daten ?? Buffer.alloc(0);
      assert.equal(`${daten.subarray(0, 4)}${daten.subarray(8, 12)}`, 'RIFFWEBP');
      assert.deepEqual(masse(daten), { breite: 1100, hoehe: 440 });
      for (const merkmal of ['GEHEIMER-ORT', 'Exif', 'EXIF', 'XMP ']) assert.ok(!daten.includes(merkmal), merkmal);
      // Quer, links rot, rechts blau; nach Drehung 6 hochkant, oben rot, unten blau.
      const flaeche = createCanvas(1100, 440);
      const g = flaeche.getContext('2d');
      g.drawImage(await loadImage(daten), 0, 0);
      const pixel = (x: number, y: number) => [...g.getImageData(x, y, 1, 1).data.slice(0, 3)];
      const [oben, unten] = [pixel(100, 40), pixel(100, 400)];
      assert.ok((oben[0] ?? 0) > 200 && (oben[2] ?? 0) < 60, `oben ${oben}`);
      assert.ok((unten[2] ?? 0) > 200 && (unten[0] ?? 0) < 60, `unten ${unten}`);

      const gelesen = (await (await frage(basis, `/api/server/${SERVER}/begruessung`, { sitzung: kennung })).json()) as Record<string, { bild: boolean }>;
      assert.deepEqual([gelesen.beitritt?.bild, gelesen.abschied?.bild], [true, false]);
      const mitBanner = { an: true, kanal: K.willkommen, text: '', banner: true, bannerText: 'Hallo {name}' };
      const gespeichert = await frage(basis, pfad, { method: 'PUT', sitzung: kennung, headers: json, body: JSON.stringify(mitBanner) });
      assert.equal(gespeichert.status, 200);
      assert.deepEqual(await gespeichert.json(), { ...mitBanner, bild: true });
      const ohneRecht = await frage(basis, pfad, { method: 'PUT', sitzung: kennung, headers: json, body: JSON.stringify({ ...mitBanner, kanal: K.regeln }) });
      assert.deepEqual(await ohneRecht.json(), { code: 'banner_ohne_recht', feld: 'banner' });
    });

    test('Vorschau: 404 ohne Bild, sonst ein PNG mit 1100 × 440; DELETE löscht Bild und Banner', async () => {
      const kennung = await sitzung();
      const ohne = await frage(basis, `/api/server/${SERVER}/begruessung/abschied/vorschau?v=1`, { sitzung: kennung });
      assert.equal(ohne.status, 404);
      assert.deepEqual(await ohne.json(), { code: 'kein_bild' });
      const avatare = mock.avatare.length;
      const vorschau = await frage(basis, `${pfad}/vorschau?v=2`, { sitzung: kennung });
      assert.equal(vorschau.status, 200);
      assert.equal(vorschau.headers.get('content-type'), 'image/png');
      assert.equal(vorschau.headers.get('cache-control'), 'no-store');
      const png = Buffer.from(await vorschau.arrayBuffer());
      assert.equal(png.subarray(1, 4).toString('latin1'), 'PNG');
      assert.deepEqual(masse(png), { breite: 1100, hoehe: 440 });
      assert.equal(mock.avatare.length, avatare + 1);

      geleert.length = 0;
      const weg = await frage(basis, `${pfad}/bild`, { method: 'DELETE', sitzung: kennung, headers: { origin: DASHBOARD } });
      assert.equal(weg.status, 204);
      assert.deepEqual(geleert, [SERVER]);
      const gelesen = (await (await frage(basis, `/api/server/${SERVER}/begruessung`, { sitzung: kennung })).json()) as Record<string, { bild: boolean; banner: boolean }>;
      assert.deepEqual([gelesen.beitritt?.bild, gelesen.beitritt?.banner], [false, false]);
      assert.equal((await frage(basis, `${pfad}/vorschau`, { sitzung: kennung })).status, 404);
    });

    test('Bild und Vorschau zusammen höchstens 20 je Minute, mit Retry-After, ohne Discord zu fragen', async () => {
      const kennung = await sitzung();
      const vorher = mitgliederAbrufe();
      for (let i = 0; i < 10; i++) {
        assert.equal((await frage(basis, `${pfad}/vorschau`, { sitzung: kennung })).status, 404);
        assert.equal((await hoch(kennung, 'image/gif', pngBild(10, 10))).status, 415);
      }
      const antwort = await frage(basis, `${pfad}/vorschau`, { sitzung: kennung });
      assert.equal(antwort.status, 429);
      assert.deepEqual(await antwort.json(), { code: 'zu_viele' });
      const warten = Number(antwort.headers.get('retry-after'));
      assert.ok(warten >= 1 && warten <= 60, String(warten));
      assert.equal(mitgliederAbrufe(), vorher + 20);
      assert.equal((await frage(basis, `/api/server/${SERVER}/kanaele`, { sitzung: kennung })).status, 200);
    });
  });

  describe('Testnachricht', () => {
    const pfad = `/api/server/${SERVER}/begruessung/beitritt/test`;
    const teste = (kennung: string) => frage(basis, pfad, { method: 'POST', sitzung: kennung, headers: { origin: DASHBOARD } });
    // Jeder Test in seiner eigenen Minute, damit die Grenze je Server neu zählt.
    const neueMinute = async () => {
      jetzt += 61_000;
      await db.query('DELETE FROM begruessungen WHERE server = $1', [SERVER]);
      await db.query('DELETE FROM bilder WHERE server = $1', [SERVER]);
    };
    const stelle = (e: Partial<Einstellung>) => speichere(db, SERVER, 'beitritt', { ...standard('beitritt'), ...e });

    test('die Regeln der Testnachricht gelten in ihrer Reihenfolge', async () => {
      await neueMinute();
      const kennung = await sitzung();
      const vorher = mock.nachrichten.length;
      const faelle: [Partial<Einstellung> | undefined, string, string][] = [
        [undefined, 'test_ohne_kanal', 'kanal'],
        [{ kanal: K.versteckt }, 'kanal_unbekannt', 'kanal'],
        [{ kanal: K.willkommen, text: ' \n ' }, 'test_ohne_inhalt', 'text'],
        [{ kanal: K.willkommen, text: '', banner: true }, 'test_ohne_inhalt', 'text'],
      ];
      for (const [e, code, feld] of faelle) {
        if (e) await stelle(e);
        const antwort = await teste(kennung);
        assert.equal(antwort.status, 400, code);
        assert.deepEqual(await antwort.json(), { code, feld });
      }
      // Mit Bild, aber im Kanal ohne „Dateien anhängen“: kein Banner, also nichts zu senden.
      await speichereBild(db, SERVER, 'beitritt', await bereiteVor(pngBild(400, 300)));
      await stelle({ kanal: K.regeln, text: '', banner: true });
      assert.deepEqual(await (await teste(kennung)).json(), { code: 'test_ohne_inhalt', feld: 'text' });
      assert.equal(mock.nachrichten.length, vorher);
    });

    test('die Testnachricht geht auch, wenn an aus ist, pingt niemanden und trägt die Untertext-Zeile', async () => {
      await neueMinute();
      const kennung = await sitzung();
      await stelle({ an: false, kanal: K.willkommen, text: 'Hallo {nutzer}, {name}!' });
      const antwort = await teste(kennung);
      assert.equal(antwort.status, 200);
      assert.deepEqual(await antwort.json(), { banner: false });
      const n = mock.nachrichten.at(-1);
      assert.equal(n?.kanal, K.willkommen);
      assert.equal(n?.json.content, String.raw`-# Testnachricht aus dem Dashboard
Hallo <@${PERSON}>, nutzer\-02!`);
      assert.deepEqual(n?.json.allowed_mentions, { parse: [] });
      assert.deepEqual(n?.dateien, []);
    });

    test('würde die Nachricht mit der Zeile länger als 2000 Zeichen, fällt die Zeile weg', async () => {
      await neueMinute();
      const kennung = await sitzung();
      const text = 'x'.repeat(1990);
      await stelle({ kanal: K.willkommen, text });
      assert.equal((await teste(kennung)).status, 200);
      assert.equal(mock.nachrichten.at(-1)?.json.content, text);
    });

    test('mit Banner antwortet sie banner: true, im Kanal ohne Dateien geht nur der Text', async () => {
      await neueMinute();
      const kennung = await sitzung();
      await speichereBild(db, SERVER, 'beitritt', await bereiteVor(pngBild(400, 300)));
      await stelle({ kanal: K.willkommen, text: '', banner: true });
      const mitBanner = await teste(kennung);
      assert.deepEqual(await mitBanner.json(), { banner: true });
      const n = mock.nachrichten.at(-1);
      assert.equal(n?.json.content, '-# Testnachricht aus dem Dashboard');
      assert.deepEqual(n?.dateien.map((d) => d.name), ['beitritt.png']);
      await stelle({ kanal: K.regeln, text: 'Hallo', banner: true });
      assert.deepEqual(await (await teste(kennung)).json(), { banner: false });
      assert.deepEqual(mock.nachrichten.at(-1)?.dateien, []);
    });

    test('ist der Text leer und scheitert das Banner, gibt es 503 und keine Nachricht', async (t) => {
      t.mock.method(console, 'error', () => {});
      await neueMinute();
      const kennung = await sitzung();
      await speichereBild(db, SERVER, 'beitritt', Buffer.from('kein Bild'));
      await stelle({ kanal: K.willkommen, text: '', banner: true });
      const vorher = mock.nachrichten.length;
      const antwort = await teste(kennung);
      assert.equal(antwort.status, 503);
      assert.deepEqual(await antwort.json(), { code: 'nicht_erreichbar' });
      assert.equal(mock.nachrichten.length, vorher);
    });

    test('die Grenze je Server zählt erst nach den Rechten: eine fremde Sitzung sperrt nichts', async () => {
      await neueMinute();
      await stelle({ kanal: K.willkommen, text: 'Hallo' });
      const fremd = await legeSitzungAn(db, { nutzer: FREMD, name: 'x', avatar: null, server: [] });
      mock.mitglieder.delete(`${SERVER}/${FREMD}`);
      for (let i = 0; i < 5; i++) assert.equal((await teste(fremd)).status, 403);
      const kennung = await sitzung();
      const vorher = mock.nachrichten.length;
      for (let i = 0; i < 3; i++) assert.equal((await teste(kennung)).status, 200);
      const antwort = await teste(kennung);
      assert.equal(antwort.status, 429);
      assert.deepEqual(await antwort.json(), { code: 'zu_viele' });
      assert.equal(antwort.headers.get('retry-after'), '60');
      assert.equal(mock.nachrichten.length, vorher + 3);
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
