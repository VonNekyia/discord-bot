// Hilfen für die Tests gegen die gemockte Discord-API. Alle IDs und Werte
// sind erfunden. Siehe docs/entwicklung/tests.md, „Die API des Dashboards“.
import { createServer, type Server } from 'node:http';
import { connect, type AddressInfo } from 'node:net';
import { createCanvas } from '@napi-rs/canvas';
import { ChannelType, ClientApplication, ClientUser, PermissionFlagsBits as R, type Client } from 'discord.js';
import { erstelleClient } from './discord/client.js';
import type { Aufruf } from './discord/befehle.js';

export const BOT = '100000000000000001';
export const PERSON = '200000000000000002';
export const ANWENDUNG = '600000000000000001';
export const ROLLE_BOT = '400000000000000001';
export const ROLLE_TEAM = '400000000000000002';
export const CODE = 'code-aus-discord-7f3a';
export const TOKEN = 'zugang-aus-discord-91c2';
export const GEHEIMNIS = 'geheimnis-der-anwendung-5d1e';
export const DASHBOARD = 'http://localhost:4173';
// Eigentümer der Anwendung, wenn ein Test nichts anderes sagt; niemand, der sich anmeldet.
export const EIGENTUEMER = '200000000000000050';
const TEAM = '710000000000000001';

// Die Anwendung, wie `GET /applications/@me` sie liefert: mit einer Person als
// Eigentümer oder mit einem Team, je Mitglied ID und `membership_state`
// (1 eingeladen, 2 angenommen).
export function anwendungDaten(besitz: { eigentuemer: string } | { team: [string, number][] }) {
  const person = (id: string) => ({ id, username: `nutzer-${id.slice(-2)}`, global_name: null, discriminator: '0', avatar: null });
  const basis = { id: ANWENDUNG, name: 'kitty', icon: null, description: '', bot_public: true, bot_require_code_grant: false, flags: 0 };
  if ('eigentuemer' in besitz) return { ...basis, owner: person(besitz.eigentuemer), team: null };
  const members = besitz.team.map(([id, membership_state]) => ({ membership_state, team_id: TEAM, user: person(id), role: 'developer', permissions: ['*'] }));
  return { ...basis, owner: person(TEAM), team: { id: TEAM, icon: null, name: 'Team', owner_user_id: besitz.team[0]?.[0] ?? null, members } };
}

export function rolle(id: string, name: string, rechte: bigint, position: number) {
  return { id, name, permissions: String(rechte), position, color: 0, hoist: false, managed: false, mentionable: false, flags: 0 };
}

// Ein Kanal; `verboten` sind Rechte, die der Rolle des Bots dort fehlen.
export function kanal(id: string, type: ChannelType, name: string, position: number, parent_id: string | null, verboten = 0n) {
  const permission_overwrites = verboten ? [{ id: ROLLE_BOT, type: 0, allow: '0', deny: String(verboten) }] : [];
  return { id, type, name, position, parent_id, permission_overwrites };
}

export function mitglied(id: string, roles: string[], weiter: { nick?: string; global_name?: string; avatar?: string } = {}) {
  const { nick = null, global_name = null, avatar = null } = weiter;
  return {
    user: { id, username: `nutzer-${id.slice(-2)}`, global_name, discriminator: '0', avatar },
    nick,
    roles,
    joined_at: '2026-01-01T00:00:00.000Z',
    deaf: false,
    mute: false,
    flags: 0,
  };
}

// Ein Server, wie GUILD_CREATE ihn bringt, mit dem Bot als Mitglied.
export function gilde(id: string, name: string, eigentuemer: string, channels: object[] = []) {
  return {
    id,
    name,
    icon: null,
    owner_id: eigentuemer,
    member_count: 42,
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

export interface Knopf {
  type: number;
  custom_id?: string;
  label?: string;
  style?: number;
}

export interface Nachricht {
  kanal: string;
  json: { content?: string; allowed_mentions?: unknown; attachments?: unknown[]; components?: { type: number; components: Knopf[] }[] };
  dateien: { name: string; daten: Buffer }[];
}

export interface Ueberschreibung {
  id: string;
  type: number;
  allow: string;
  deny: string;
}

// Eine Antwort auf eine Interaktion: der Callback mit seinem Typ (4 Antwort,
// 5 Antwort später, 6 Update später, 9 Formular), `bearbeitet` für
// `PATCH /webhooks/{id}/{token}/messages/@original` oder `nachgereicht`
// für `POST /webhooks/{id}/{token}` (`followUp`).
export interface Antwort {
  token: string;
  typ: number | 'bearbeitet' | 'nachgereicht';
  daten: {
    content?: string;
    flags?: number;
    custom_id?: string;
    title?: string;
    components?: { type: number; components?: Knopf[]; component?: Knopf & { value?: string } }[];
  };
}

export interface MockDiscord {
  url: string;
  server: Server;
  anfragen: { methode: string; pfad: string; kopf: Record<string, string | string[] | undefined>; body: string }[];
  // `${server}/${nutzer}` → Mitglied oder Status.
  mitglieder: Map<string, object | number>;
  // Status für /users/@me, und was /users/@me/guilds liefert.
  person: number;
  meineServer: object[];
  nachrichten: Nachricht[];
  avatare: string[];
  // Angelegte Kanäle (Body von POST /guilds/{id}/channels), Verschiebungen
  // (PATCH auf ein Mitglied mit channel_id) und gelöschte Kanäle.
  angelegt: { name: string; type: number; parent_id: string | null; user_limit: number; permission_overwrites: Ueberschreibung[] }[];
  verschoben: { nutzer: string; kanal: string | null; grund?: string }[];
  geloescht: string[];
  // Kanäle, die `PATCH /channels/{id}` kennt: die angelegten und die, die ein Test einträgt.
  kanaele: Map<string, Record<string, unknown>>;
  // Jedes `PATCH /channels/{id}` mit Body und Grund im Audit-Log.
  geaendert: { kanal: string; body: { name?: string; user_limit?: number; permission_overwrites?: Ueberschreibung[] }; grund?: string }[];
  antworten: Antwort[];
  // Antwortet Discord mit einem Fehler: Status und Code, sonst undefined.
  anlegenFehler?: [number, number];
  verschiebenFehler?: [number, number];
  loeschenFehler?: [number, number];
  aendernFehler?: [number, number];
  nachrichtFehler?: [number, number];
  // Jeder Callback und jedes `followUp` einer Interaktion scheitert so.
  antwortFehler?: [number, number];
  // Sekunden in `Retry-After`, wenn ein `PATCH /channels/{id}` einen Namen setzt.
  umbenennenWarten?: number;
  // Je kommendem `POST /oauth2/token` die Sekunden in `Retry-After` eines 429; leer: kein 429.
  tauschWarten: number[];
  // Was `GET /applications/@me` liefert, oder ein Status für einen Fehler.
  anwendung: object | number;
  // Die Entitlements der Anwendung. `GET …/entitlements` filtert nach
  // `user_id`, `guild_id`, `sku_ids`, `exclude_ended`, `exclude_deleted` und
  // `after`; `POST …/entitlements/{id}/consume` setzt `consumed`.
  kaeufe: Entitlement[];
  // Das Lesen der Liste scheitert so: Status oder Abbruch der Verbindung.
  kaeufeFehler?: number | 'abbruch';
  // Je kommendem Lesen der Liste: `ok`, ein Status oder ein Abbruch; danach wie sonst.
  kaeufeFolge: ('ok' | number | 'abbruch')[];
  // Je kommendem Lesen der Liste die Sekunden in `Retry-After` eines 429.
  kaeufeWarten: number[];
  // Bann (`PUT /guilds/{id}/bans/{nutzer}`) und Kick (`DELETE /guilds/{id}/members/{nutzer}`)
  // mit Body und Grund im Audit-Log; Status und Code, wenn sie scheitern sollen.
  gebannt: { server: string; nutzer: string; body: unknown; grund?: string }[];
  gekickt: { server: string; nutzer: string; grund?: string }[];
  bannFehler?: [number, number];
  kickFehler?: [number, number];
  // DMs: der Kanal je Person ist `9` und ihre ID ohne die erste Ziffer;
  // `dmFehler` lässt das Senden scheitern, etwa mit 50007.
  dmFehler?: [number, number];
  // Was `GET /users/{id}` liefert; fehlt die ID, 404 mit 10013.
  nutzer: Map<string, object>;
  verbrauchenFehler?: [number, number];
}

// Ein Entitlement, wie Discord es liefert.
export interface Entitlement {
  id: string;
  sku_id: string;
  application_id: string;
  type: number;
  deleted: boolean;
  consumed?: boolean;
  user_id?: string;
  guild_id?: string;
  ends_at?: string | null;
}

// Ein Einmalkauf einer Person (type 8, Kauf im Store).
export function einmalkauf(id: string, sku: string, nutzer: string): Entitlement {
  return { id, sku_id: sku, application_id: ANWENDUNG, type: 8, deleted: false, consumed: false, user_id: nutzer };
}

// Ein Abo eines Servers (type 8); ohne Ende läuft es, wie ein Test-Entitlement.
export function abo(id: string, sku: string, server: string, ende: string | null = null): Entitlement {
  return { id, sku_id: sku, application_id: ANWENDUNG, type: 8, deleted: false, guild_id: server, ends_at: ende };
}

// Eine Nachricht des Bots, wie Discord sie zurückgibt.
export function nachrichtDaten(kanal: string, content: string, components: object[] = []) {
  return {
    id: '700000000000000001',
    channel_id: kanal,
    author: { id: BOT, username: 'kitty', discriminator: '0', avatar: null, bot: true },
    content,
    timestamp: '2026-01-01T00:00:00.000Z',
    edited_timestamp: null,
    tts: false,
    mention_everyone: false,
    mentions: [],
    mention_roles: [],
    attachments: [],
    embeds: [],
    components,
    pinned: false,
    type: 0,
  };
}

// Teilt multipart/form-data in payload_json und Dateien.
function multipart(body: Buffer, typ: string): Pick<Nachricht, 'json' | 'dateien'> {
  const grenze = /boundary=(.+)$/.exec(typ)?.[1] ?? '';
  const ergebnis: Pick<Nachricht, 'json' | 'dateien'> = { json: {}, dateien: [] };
  for (const teil of body.toString('latin1').split(`--${grenze}`)) {
    const trenner = teil.indexOf('\r\n\r\n');
    if (trenner < 0) continue;
    const kopf = teil.slice(0, trenner);
    const daten = Buffer.from(teil.slice(trenner + 4, -2), 'latin1');
    const datei = /filename="([^"]+)"/.exec(kopf)?.[1];
    if (datei) ergebnis.dateien.push({ name: datei, daten });
    else if (kopf.includes('name="payload_json"')) ergebnis.json = JSON.parse(daten.toString('utf8'));
  }
  return ergebnis;
}

// Ein kleines PNG als Avatar aus dem CDN.
const avatarPng = createCanvas(64, 64).encodeSync('png');

// Gemockte Discord-API: OAuth2, Mitglieder, Nachrichten und das CDN der Avatare.
export async function mockDiscord(): Promise<MockDiscord> {
  const mock = {
    anfragen: [],
    mitglieder: new Map(),
    person: 200,
    meineServer: [],
    nachrichten: [],
    avatare: [],
    angelegt: [],
    verschoben: [],
    geloescht: [],
    kanaele: new Map(),
    geaendert: [],
    antworten: [],
    tauschWarten: [],
    anwendung: anwendungDaten({ eigentuemer: EIGENTUEMER }),
    kaeufe: [],
    kaeufeWarten: [],
    kaeufeFolge: [],
    gebannt: [],
    gekickt: [],
    nutzer: new Map(),
  } as unknown as MockDiscord;
  let naechsterKanal = 800000000000000001n;
  mock.server = createServer((req, res) => {
    const teile: Buffer[] = [];
    req.on('data', (teil: Buffer) => teile.push(teil));
    req.on('end', () => {
      const roh = Buffer.concat(teile);
      const body = roh.toString('utf8');
      const pfad = req.url ?? '';
      mock.anfragen.push({ methode: req.method ?? '', pfad, kopf: req.headers, body });
      const antworte = (status: number, wert: unknown) =>
        res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(wert));
      const kopf = req.headers['x-audit-log-reason'];
      const grund = typeof kopf === 'string' ? decodeURIComponent(kopf) : undefined;
      const basic = `Basic ${Buffer.from(`${ANWENDUNG}:${GEHEIMNIS}`).toString('base64')}`;
      const form = new URLSearchParams(body);
      if (pfad.startsWith('/cdn/')) {
        mock.avatare.push(pfad);
        return res.writeHead(200, { 'content-type': 'image/png' }).end(avatarPng);
      }
      if (pfad === '/api/v10/oauth2/token') {
        const warten = mock.tauschWarten.shift();
        if (warten !== undefined) {
          res.writeHead(429, { 'content-type': 'application/json', 'retry-after': String(warten), 'x-ratelimit-scope': 'user' });
          return res.end(JSON.stringify({ message: 'You are being rate limited.', retry_after: warten, global: false }));
        }
        const passt = req.headers.authorization === basic && form.get('code') === CODE && form.get('grant_type') === 'authorization_code';
        return passt ? antworte(200, { access_token: TOKEN, token_type: 'Bearer', expires_in: 604800, scope: 'identify guilds' }) : antworte(400, { error: 'invalid_grant' });
      }
      if (pfad === '/api/v10/oauth2/token/revoke') return antworte(req.headers.authorization === basic ? 200 : 401, {});
      if (pfad === '/api/v10/users/@me/channels' && req.method === 'POST') {
        const empfaenger = String(JSON.parse(body).recipient_id ?? '');
        return antworte(200, { id: `9${empfaenger.slice(1)}`, type: 1, recipients: [mitglied(empfaenger, []).user] });
      }
      const nutzerTreffer = /^\/api\/v10\/users\/(\d+)$/.exec(pfad);
      if (nutzerTreffer && req.method === 'GET') {
        const gefunden = mock.nutzer.get(nutzerTreffer[1] ?? '');
        return gefunden ? antworte(200, gefunden) : antworte(404, { message: 'Unknown User', code: 10013 });
      }
      const bann = /^\/api\/v10\/guilds\/(\d+)\/bans\/(\d+)$/.exec(pfad);
      if (bann && req.method === 'PUT') {
        if (mock.bannFehler) return antworte(mock.bannFehler[0], { message: 'Fehler', code: mock.bannFehler[1] });
        mock.gebannt.push({ server: bann[1] ?? '', nutzer: bann[2] ?? '', body: body ? JSON.parse(body) : {}, grund });
        return res.writeHead(204).end();
      }
      if (pfad.startsWith('/api/v10/users/@me') && req.headers.authorization !== `Bearer ${TOKEN}`) return antworte(401, {});
      if (pfad === '/api/v10/users/@me') {
        return mock.person === 200
          ? antworte(200, { id: PERSON, username: 'probe', global_name: 'Probe Person', avatar: 'abc123' })
          : antworte(mock.person, {});
      }
      if (pfad === '/api/v10/users/@me/guilds') return antworte(200, mock.meineServer);
      if (pfad === '/api/v10/applications/@me' && req.method === 'GET') {
        return typeof mock.anwendung === 'number' ? antworte(mock.anwendung, { message: 'Fehler', code: 0 }) : antworte(200, mock.anwendung);
      }
      const kaufListe = /^\/api\/v10\/applications\/\d+\/entitlements(\?.*)?$/.exec(pfad);
      if (kaufListe && req.method === 'GET') {
        const folge = mock.kaeufeFolge.shift() ?? mock.kaeufeFehler;
        if (folge === 'abbruch') return req.socket.destroy();
        if (typeof folge === 'number') return antworte(folge, { message: 'Fehler', code: 0 });
        const warten = mock.kaeufeWarten.shift();
        if (warten !== undefined) {
          res.writeHead(429, { 'content-type': 'application/json', 'retry-after': String(warten), 'x-ratelimit-scope': 'user' });
          return res.end(JSON.stringify({ message: 'You are being rate limited.', retry_after: warten, global: false }));
        }
        const q = new URLSearchParams(kaufListe[1]?.slice(1) ?? '');
        const skus = q.get('sku_ids')?.split(',');
        const nach = BigInt(q.get('after') ?? '0');
        const jetzt = Date.now();
        const treffer = mock.kaeufe
          .filter(
            (k) =>
              (q.get('exclude_deleted') === 'false' || !k.deleted) &&
              BigInt(k.id) > nach &&
              (!q.has('user_id') || k.user_id === q.get('user_id')) &&
              (!q.has('guild_id') || k.guild_id === q.get('guild_id')) &&
              (!skus || skus.includes(k.sku_id)) &&
              (q.get('exclude_ended') !== 'true' || !k.ends_at || Date.parse(k.ends_at) > jetzt),
          )
          .toSorted((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1))
          .slice(0, Number(q.get('limit') ?? 100));
        return antworte(200, treffer);
      }
      const verbrauchen = /^\/api\/v10\/applications\/\d+\/entitlements\/(\d+)\/consume$/.exec(pfad);
      if (verbrauchen && req.method === 'POST') {
        if (mock.verbrauchenFehler) return antworte(mock.verbrauchenFehler[0], { message: 'Fehler', code: mock.verbrauchenFehler[1] });
        const kauf = mock.kaeufe.find((k) => k.id === verbrauchen[1] && !k.deleted);
        if (!kauf) return antworte(404, { message: 'Unknown Entitlement', code: 10029 });
        kauf.consumed = true;
        return res.writeHead(204).end();
      }
      const einKauf = /^\/api\/v10\/applications\/\d+\/entitlements\/(\d+)$/.exec(pfad);
      if (einKauf && req.method === 'GET') {
        const kauf = mock.kaeufe.find((k) => k.id === einKauf[1] && !k.deleted);
        return kauf ? antworte(200, kauf) : antworte(404, { message: 'Unknown Entitlement', code: 10029 });
      }
      const nachricht = /^\/api\/v10\/channels\/(\d+)\/messages$/.exec(pfad);
      if (nachricht && req.method === 'POST' && mock.dmFehler && nachricht[1]?.startsWith('9')) {
        return antworte(mock.dmFehler[0], { message: 'Fehler', code: mock.dmFehler[1] });
      }
      if (nachricht && req.method === 'POST') {
        if (mock.nachrichtFehler) return antworte(mock.nachrichtFehler[0], { message: 'Fehler', code: mock.nachrichtFehler[1] });
        const typ = req.headers['content-type'] ?? '';
        const inhalt = typ.startsWith('multipart/') ? multipart(roh, typ) : { json: JSON.parse(body), dateien: [] };
        mock.nachrichten.push({ kanal: nachricht[1] ?? '', ...inhalt });
        return antworte(200, nachrichtDaten(nachricht[1] ?? '', inhalt.json.content ?? ''));
      }
      const rueckruf = /^\/api\/v10\/interactions\/(\d+)\/([^/]+)\/callback(\?.*)?$/.exec(pfad);
      if (rueckruf && req.method === 'POST') {
        if (mock.antwortFehler) return antworte(mock.antwortFehler[0], { message: 'Fehler', code: mock.antwortFehler[1] });
        const daten = JSON.parse(body);
        mock.antworten.push({ token: rueckruf[2] ?? '', typ: daten.type, daten: daten.data ?? {} });
        return res.writeHead(204).end();
      }
      const bearbeitet = /^\/api\/v10\/webhooks\/(\d+)\/([^/]+)\/messages\/(?:@|%40)original(\?.*)?$/.exec(pfad);
      if (bearbeitet && req.method === 'PATCH') {
        const daten = JSON.parse(body);
        mock.antworten.push({ token: bearbeitet[2] ?? '', typ: 'bearbeitet', daten });
        return antworte(200, nachrichtDaten('700000000000000099', daten.content ?? ''));
      }
      const nachgereicht = /^\/api\/v10\/webhooks\/(\d+)\/([^/?]+)(\?.*)?$/.exec(pfad);
      if (nachgereicht && req.method === 'POST') {
        if (mock.antwortFehler) return antworte(mock.antwortFehler[0], { message: 'Fehler', code: mock.antwortFehler[1] });
        const daten = JSON.parse(body);
        mock.antworten.push({ token: nachgereicht[2] ?? '', typ: 'nachgereicht', daten });
        return antworte(200, nachrichtDaten('700000000000000098', daten.content ?? ''));
      }
      const aendern =/^\/api\/v10\/channels\/(\d+)$/.exec(pfad);
      if (aendern && req.method === 'PATCH') {
        const daten = JSON.parse(body);
        mock.geaendert.push({ kanal: aendern[1] ?? '', body: daten, grund });
        if (mock.umbenennenWarten !== undefined && 'name' in daten) {
          const warten = String(mock.umbenennenWarten);
          return res
            .writeHead(429, { 'content-type': 'application/json', 'retry-after': warten, 'x-ratelimit-scope': 'user' })
            .end(JSON.stringify({ message: 'You are being rate limited.', retry_after: mock.umbenennenWarten, global: false }));
        }
        if (mock.aendernFehler) return antworte(mock.aendernFehler[0], { message: 'Fehler', code: mock.aendernFehler[1] });
        const alt = mock.kanaele.get(aendern[1] ?? '');
        if (!alt) return antworte(404, { message: 'Unknown Channel', code: 10003 });
        const neu = { ...alt, ...daten };
        mock.kanaele.set(aendern[1] ?? '', neu);
        return antworte(200, neu);
      }
      const anlegen = /^\/api\/v10\/guilds\/(\d+)\/channels$/.exec(pfad);
      if (anlegen && req.method === 'POST') {
        if (mock.anlegenFehler) return antworte(mock.anlegenFehler[0], { message: 'Fehler', code: mock.anlegenFehler[1] });
        const daten = JSON.parse(body);
        mock.angelegt.push(daten);
        const neu = { ...daten, id: String(naechsterKanal++), guild_id: anlegen[1], position: 0 };
        mock.kanaele.set(neu.id, neu);
        return antworte(201, neu);
      }
      const kanalWeg = /^\/api\/v10\/channels\/(\d+)$/.exec(pfad);
      if (kanalWeg && req.method === 'DELETE') {
        if (mock.loeschenFehler) return antworte(mock.loeschenFehler[0], { message: 'Fehler', code: mock.loeschenFehler[1] });
        mock.geloescht.push(kanalWeg[1] ?? '');
        return antworte(200, { id: kanalWeg[1], type: 2 });
      }
      const treffer = /^\/api\/v10\/guilds\/(\d+)\/members\/(\d+)$/.exec(pfad);
      if (treffer && req.method === 'DELETE') {
        if (mock.kickFehler) return antworte(mock.kickFehler[0], { message: 'Fehler', code: mock.kickFehler[1] });
        mock.gekickt.push({ server: treffer[1] ?? '', nutzer: treffer[2] ?? '', grund });
        return res.writeHead(204).end();
      }
      if (treffer && req.method === 'PATCH') {
        if (mock.verschiebenFehler) return antworte(mock.verschiebenFehler[0], { message: 'Fehler', code: mock.verschiebenFehler[1] });
        mock.verschoben.push({ nutzer: treffer[2] ?? '', kanal: JSON.parse(body).channel_id ?? null, grund });
        return antworte(200, mitglied(treffer[2] ?? '', []));
      }
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

export async function schliesse(mock: MockDiscord): Promise<void> {
  mock.server.closeAllConnections();
  await new Promise((fertig) => mock.server.close(fertig));
}

// Ein Client wie nach dem Start, ohne Gateway: die Server im Cache, REST
// und CDN gegen den Mock.
export function discordClient(mock: MockDiscord, gilden: object[]): Client {
  const client = erstelleClient({ rest: { api: `${mock.url}/api`, cdn: `${mock.url}/cdn`, retries: 0 } });
  client.rest.setToken('test');
  client.user = Reflect.construct(ClientUser, [client, { id: BOT, username: 'kitty', discriminator: '0', bot: true, avatar: null }]);
  // Wie nach READY: nur ID und Flags; Eigentümer und Team holt erst `fetch`.
  Object.assign(client, { application: Reflect.construct(ClientApplication, [client, { id: ANWENDUNG, flags: 0 }]) });
  const guilds = client.guilds as unknown as { _add(daten: unknown): unknown };
  for (const g of gilden) guilds._add(g);
  return client;
}

// Eine Anfrage an die API, ohne Weiterleitungen zu folgen.
export async function frage(
  basis: string,
  pfad: string,
  init: { method?: string; sitzung?: string; headers?: Record<string, string>; body?: string | Buffer } = {},
) {
  const headers: Record<string, string> = { ...init.headers };
  if (init.sitzung) headers.cookie = `sitzung=${init.sitzung}`;
  const body = typeof init.body === 'string' || init.body === undefined ? init.body : new Uint8Array(init.body);
  return fetch(`${basis}${pfad}`, { method: init.method ?? 'GET', headers, body, redirect: 'manual' });
}

// Schickt rohe Bytes und liest, bis der Server die Verbindung schliesst.
export function roh(port: number, daten: string): Promise<string> {
  return new Promise((fertig, scheitern) => {
    const socket = connect(port, '127.0.0.1', () => socket.write(daten));
    let antwort = '';
    socket.on('data', (teil) => (antwort += teil));
    socket.on('end', () => fertig(antwort));
    socket.on('error', (fehler) => (antwort ? fertig(antwort) : scheitern(fehler)));
  });
}

const crcTabelle = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function pngTeil(typ: string, daten: Buffer): Buffer {
  const laenge = Buffer.alloc(4);
  laenge.writeUInt32BE(daten.length);
  const inhalt = Buffer.concat([Buffer.from(typ, 'latin1'), daten]);
  let c = 0xffffffff;
  for (const b of inhalt) c = (crcTabelle[(c ^ b) & 0xff] ?? 0) ^ (c >>> 8);
  const pruefsumme = Buffer.alloc(4);
  pruefsumme.writeUInt32BE((c ^ 0xffffffff) >>> 0);
  return Buffer.concat([laenge, inhalt, pruefsumme]);
}

// Nur Signatur und IHDR eines PNG: Masse im Kopf, aber nichts zu dekodieren.
export function pngKopf(breite: number, hoehe: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(breite, 0);
  ihdr.writeUInt32BE(hoehe, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pngTeil('IHDR', ihdr)]);
}

// Ein JPEG, links rot, rechts blau, mit EXIF: Drehung 6 (90° im Uhrzeigersinn),
// eine Beschreibung `merkmal` und ein GPS-Block.
export async function jpegMitExif(breite: number, hoehe: number, merkmal: string): Promise<Buffer> {
  const flaeche = createCanvas(breite, hoehe);
  const g = flaeche.getContext('2d');
  g.fillStyle = '#ff0000';
  g.fillRect(0, 0, breite / 2, hoehe);
  g.fillStyle = '#0000ff';
  g.fillRect(breite / 2, 0, breite / 2, hoehe);
  const jpeg = await flaeche.encode('jpeg', 90);

  // TIFF, big endian. IFD0: Beschreibung, Drehung, Zeiger auf GPS. GPS-IFD: Breitengrad N.
  const text = Buffer.from(`${merkmal}\0`, 'latin1');
  const ifd0 = 8;
  const ifd0Laenge = 2 + 3 * 12 + 4;
  const textAb = ifd0 + ifd0Laenge;
  const gpsAb = textAb + text.length;
  const gpsLaenge = 2 + 2 * 12 + 4;
  const breitengradAb = gpsAb + gpsLaenge;
  const tiff = Buffer.alloc(breitengradAb + 24);
  tiff.write('MM', 0, 'latin1');
  tiff.writeUInt16BE(42, 2);
  tiff.writeUInt32BE(ifd0, 4);
  const eintrag = (ab: number, tag: number, typ: number, anzahl: number, wert: number, kurz = false) => {
    tiff.writeUInt16BE(tag, ab);
    tiff.writeUInt16BE(typ, ab + 2);
    tiff.writeUInt32BE(anzahl, ab + 4);
    if (kurz) tiff.writeUInt16BE(wert, ab + 8);
    else tiff.writeUInt32BE(wert, ab + 8);
  };
  tiff.writeUInt16BE(3, ifd0);
  eintrag(ifd0 + 2, 0x010e, 2, text.length, textAb);
  eintrag(ifd0 + 14, 0x0112, 3, 1, 6, true);
  eintrag(ifd0 + 26, 0x8825, 4, 1, gpsAb);
  text.copy(tiff, textAb);
  tiff.writeUInt16BE(2, gpsAb);
  eintrag(gpsAb + 2, 0x0001, 2, 2, 0x4e000000);
  eintrag(gpsAb + 14, 0x0002, 5, 3, breitengradAb);
  for (const [i, wert] of [47, 22, 1].entries()) {
    tiff.writeUInt32BE(wert, breitengradAb + i * 8);
    tiff.writeUInt32BE(1, breitengradAb + i * 8 + 4);
  }
  const app1 = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]);
  const kopf = Buffer.from([0xff, 0xe1, (app1.length + 2) >> 8, (app1.length + 2) & 0xff]);
  return Buffer.concat([jpeg.subarray(0, 2), kopf, app1, jpeg.subarray(2)]);
}

// Ein SVG mit 300 × 300 px, das @napi-rs/canvas lesen könnte.
export function svgBild(): Buffer {
  return Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="red"/></svg>');
}

// Ein GIF mit 300 × 300 px Fläche und einem Pixel, das @napi-rs/canvas lesen könnte.
export function gifBild(): Buffer {
  const flaeche = Buffer.alloc(7);
  flaeche.writeUInt16LE(300, 0);
  flaeche.writeUInt16LE(300, 2);
  flaeche[4] = 0x80;
  return Buffer.concat([
    Buffer.from('GIF89a', 'latin1'),
    flaeche,
    Buffer.from([0xff, 0, 0, 0xff, 0xff, 0xff]),
    Buffer.from([0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0]),
    Buffer.from([0x02, 0x02, 0x44, 0x01, 0x00, 0x3b]),
  ]);
}

// Ein PNG in einer Farbe.
export function pngBild(breite: number, hoehe: number, farbe = '#3a7d44'): Buffer {
  const flaeche = createCanvas(breite, hoehe);
  const g = flaeche.getContext('2d');
  g.fillStyle = farbe;
  g.fillRect(0, 0, breite, hoehe);
  return flaeche.encodeSync('png');
}

export { ChannelType, R };

// Ein Aufruf eines Befehls ohne Discord; was der Test nicht gibt, wirft.
export function falscherAufruf(teile: Partial<Aufruf>): Aufruf {
  const fehlt = (was: string) => () => {
    throw new Error(`${was} fehlt im falschen Aufruf`);
  };
  return {
    antworte: async () => fehlt('antworte')(),
    text: () => undefined,
    ziel: () => undefined,
    zeigeFormular: async () => fehlt('zeigeFormular')(),
    warte: async () => fehlt('warte')(),
    fertig: async () => fehlt('fertig')(),
    ...teile,
  };
}
