// Hilfen für die Tests gegen die gemockte Discord-API. Alle IDs und Werte
// sind erfunden. Siehe docs/entwicklung/tests.md, „Die API des Dashboards“.
import { createServer, type Server } from 'node:http';
import { connect, type AddressInfo } from 'node:net';
import { createCanvas } from '@napi-rs/canvas';
import { ChannelType, ClientUser, PermissionFlagsBits as R, type Client } from 'discord.js';
import { erstelleClient } from './client.js';

export const BOT = '100000000000000001';
export const PERSON = '200000000000000002';
export const ANWENDUNG = '600000000000000001';
export const ROLLE_BOT = '400000000000000001';
export const ROLLE_TEAM = '400000000000000002';
export const CODE = 'code-aus-discord-7f3a';
export const TOKEN = 'zugang-aus-discord-91c2';
export const GEHEIMNIS = 'geheimnis-der-anwendung-5d1e';
export const DASHBOARD = 'http://localhost:4173';

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

export interface Nachricht {
  kanal: string;
  json: { content?: string; allowed_mentions?: unknown; attachments?: unknown[] };
  dateien: { name: string; daten: Buffer }[];
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
  const mock = { anfragen: [], mitglieder: new Map(), person: 200, meineServer: [], nachrichten: [], avatare: [] } as unknown as MockDiscord;
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
      const basic = `Basic ${Buffer.from(`${ANWENDUNG}:${GEHEIMNIS}`).toString('base64')}`;
      const form = new URLSearchParams(body);
      if (pfad.startsWith('/cdn/')) {
        mock.avatare.push(pfad);
        return res.writeHead(200, { 'content-type': 'image/png' }).end(avatarPng);
      }
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
      if (pfad === '/api/v10/users/@me/guilds') return antworte(200, mock.meineServer);
      const nachricht = /^\/api\/v10\/channels\/(\d+)\/messages$/.exec(pfad);
      if (nachricht && req.method === 'POST') {
        const typ = req.headers['content-type'] ?? '';
        const inhalt = typ.startsWith('multipart/') ? multipart(roh, typ) : { json: JSON.parse(body), dateien: [] };
        mock.nachrichten.push({ kanal: nachricht[1] ?? '', ...inhalt });
        return antworte(200, {
          id: '700000000000000001',
          channel_id: nachricht[1],
          author: { id: BOT, username: 'kitty', discriminator: '0', avatar: null, bot: true },
          content: inhalt.json.content ?? '',
          timestamp: '2026-01-01T00:00:00.000Z',
          edited_timestamp: null,
          tts: false,
          mention_everyone: false,
          mentions: [],
          mention_roles: [],
          attachments: [],
          embeds: [],
          pinned: false,
          type: 0,
        });
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
