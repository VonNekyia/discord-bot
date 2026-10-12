import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { PermissionFlagsBits } from 'discord.js';
import type { Pool } from 'pg';
import type { OAuthFrage } from '../discord/oauth.js';

// Wie lange das Cookie `anmeldung` gilt, in Sekunden.
// Siehe docs/schnittstelle/anmeldung.md, „Ablauf“.
export const anmeldeFrist = 10 * 60;
// Wie lange eine Sitzung gilt, in Sekunden.
// Siehe docs/schnittstelle/anmeldung.md, „Sitzung“.
export const laufzeit = 7 * 24 * 60 * 60;

// Was der Bot für OAuth2 von Discord braucht. `frage` schickt die Aufrufe,
// im Bot über `@discordjs/rest` (`oauthUeber` in `bot/src/discord/oauth.ts`).
export interface OAuth {
  frage: OAuthFrage;
  anwendung: string;
  geheimnis: string;
  zurueck: string;
}

export interface Sitzung {
  kennung: Buffer;
  nutzer: string;
  name: string;
  avatar: string | null;
  server: string[];
}

export function zufall(): string {
  return randomBytes(32).toString('base64url');
}

// Vergleicht in fester Zeit, damit die Antwortzeit nichts über `state` verrät.
export function gleich(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function zuDiscord(o: OAuth, state: string): string {
  const ziel = new URL('https://discord.com/oauth2/authorize');
  ziel.search = new URLSearchParams({
    response_type: 'code',
    client_id: o.anwendung,
    scope: 'identify guilds',
    redirect_uri: o.zurueck,
    state,
  }).toString();
  return ziel.href;
}

// Ein Feld aus einer Antwort von Discord, ohne Annahme über ihre Form.
function feld(wert: unknown, name: string): unknown {
  if (typeof wert !== 'object' || wert === null) return undefined;
  const inhalt: unknown = Reflect.get(wert, name);
  return inhalt;
}

function anwendungsKopf(o: OAuth): string {
  return `Basic ${Buffer.from(`${o.anwendung}:${o.geheimnis}`).toString('base64')}`;
}

// Tauscht den Code gegen einen Access Token.
export async function tausche(o: OAuth, code: string): Promise<string> {
  const antwort = await o.frage({
    schritt: 'Tausch',
    methode: 'POST',
    pfad: '/oauth2/token',
    kopf: anwendungsKopf(o),
    form: { grant_type: 'authorization_code', code, redirect_uri: o.zurueck },
  });
  const token = feld(antwort, 'access_token');
  if (typeof token !== 'string') throw new Error('Tausch: kein Token in der Antwort');
  return token;
}

export async function widerrufe(o: OAuth, token: string): Promise<void> {
  await o.frage({
    schritt: 'Widerruf',
    methode: 'POST',
    pfad: '/oauth2/token/revoke',
    kopf: anwendungsKopf(o),
    form: { token, token_type_hint: 'access_token' },
  });
}

// Person und die Server, die sie verwalten darf: Eigentümer, „Server
// verwalten“ oder „Administrator“. Siehe docs/schnittstelle/anmeldung.md, „Ablauf“.
export async function liesPerson(o: OAuth, token: string): Promise<Omit<Sitzung, 'kennung'>> {
  const kopf = `Bearer ${token}`;
  const ich = await o.frage({ schritt: 'Person', methode: 'GET', pfad: '/users/@me', kopf });
  const id = feld(ich, 'id');
  const nutzername = feld(ich, 'username');
  if (typeof id !== 'string' || typeof nutzername !== 'string') throw new Error('Person: Antwort unvollständig');
  const liste = await o.frage({ schritt: 'Server', methode: 'GET', pfad: '/users/@me/guilds', kopf });
  if (!Array.isArray(liste)) throw new Error('Server: Antwort ist keine Liste');
  const verwalten = PermissionFlagsBits.ManageGuild | PermissionFlagsBits.Administrator;
  const server: string[] = [];
  const eintraege: unknown[] = liste;
  for (const s of eintraege) {
    const serverId = feld(s, 'id');
    const rechte = feld(s, 'permissions');
    if (typeof serverId !== 'string' || !/^\d{1,20}$/.test(serverId)) continue;
    if (feld(s, 'owner') === true || (typeof rechte === 'string' && (BigInt(rechte) & verwalten) !== 0n)) server.push(serverId);
  }
  const globalerName = feld(ich, 'global_name');
  const avatar = feld(ich, 'avatar');
  return {
    nutzer: id,
    name: typeof globalerName === 'string' ? globalerName : nutzername,
    avatar: typeof avatar === 'string' ? avatar : null,
    server,
  };
}

function hash(kennung: Buffer): Buffer {
  return createHash('sha256').update(kennung).digest();
}

// Legt eine Sitzung an und gibt die Kennung für das Cookie zurück. In der
// Datenbank steht nur ihr SHA-256. Siehe docs/schnittstelle/anmeldung.md, „Sitzung“.
export async function legeSitzungAn(db: Pick<Pool, 'query'>, person: Omit<Sitzung, 'kennung'>): Promise<string> {
  const kennung = randomBytes(32);
  await db.query(
    `INSERT INTO sitzungen (kennung, nutzer, name, avatar, server, ablauf)
     VALUES ($1, $2, $3, $4, $5, now() + make_interval(secs => $6))`,
    [hash(kennung), person.nutzer, person.name, person.avatar, person.server, laufzeit],
  );
  return kennung.toString('base64url');
}

// Die Sitzung zum Cookie, wenn es sie gibt und sie nicht abgelaufen ist.
export async function findeSitzung(db: Pick<Pool, 'query'>, wert: string | undefined): Promise<Sitzung | undefined> {
  if (!wert || !/^[A-Za-z0-9_-]{43}$/.test(wert)) return undefined;
  const kennung = hash(Buffer.from(wert, 'base64url'));
  const { rows } = await db.query<Omit<Sitzung, 'kennung'>>(
    'SELECT nutzer, name, avatar, server FROM sitzungen WHERE kennung = $1 AND ablauf > now()',
    [kennung],
  );
  return rows[0] && { kennung, ...rows[0] };
}

export async function loescheSitzung(db: Pick<Pool, 'query'>, kennung: Buffer): Promise<void> {
  await db.query('DELETE FROM sitzungen WHERE kennung = $1', [kennung]);
}

// Löscht abgelaufene Sitzungen und gibt ihre Zahl zurück.
export async function raeumeAuf(db: Pick<Pool, 'query'>): Promise<number> {
  return (await db.query('DELETE FROM sitzungen WHERE ablauf <= now()')).rowCount ?? 0;
}

export function liesCookies(kopf: string | undefined): Map<string, string> {
  const cookies = new Map<string, string>();
  for (const teil of (kopf ?? '').split(';')) {
    const gleichheit = teil.indexOf('=');
    if (gleichheit < 0) continue;
    const name = teil.slice(0, gleichheit).trim();
    if (!cookies.has(name)) cookies.set(name, teil.slice(gleichheit + 1).trim());
  }
  return cookies;
}

// Ein Set-Cookie mit HttpOnly und SameSite=Lax; `sicher` setzt Secure.
// Siehe docs/schnittstelle/anmeldung.md, „Sitzung“.
export function cookie(name: string, wert: string, pfad: string, maxAge: number, sicher: boolean): string {
  return `${name}=${wert}; Path=${pfad}; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${sicher ? '; Secure' : ''}`;
}
