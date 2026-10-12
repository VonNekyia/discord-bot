import { createServer, type IncomingMessage, type OutgoingHttpHeaders, type Server, type ServerResponse } from 'node:http';
import {
  ChannelType,
  DiscordAPIError,
  PermissionFlagsBits,
  RESTJSONErrorCodes,
  type Client,
  type Guild,
  type GuildMember,
  type NewsChannel,
  type TextChannel,
} from 'discord.js';
import type { Pool } from 'pg';
import {
  anmeldeFrist,
  cookie,
  findeSitzung,
  gleich,
  laufzeit,
  legeSitzungAn,
  liesCookies,
  liesPerson,
  loescheSitzung,
  tausche,
  widerrufe,
  zufall,
  zuDiscord,
  type OAuth,
  type Sitzung,
} from './anmeldung.js';
import { BildFehler, bereiteVor } from '../module/begruessung/banner.js';
import { text } from '../kern/fehler.js';
import { lese, loescheBild, pruefe, speichere, speichereBild, type Art } from '../module/begruessung/begruessung.js';
import { oauthUeber } from '../discord/oauth.js';
import { wieDiscord } from '../discord/ordnung.js';
import type { Zaehlung } from '../kern/zaehlung.js';
import { raeumeVon } from '../module/sprachraeume/raeume.js';
import { banner, sendeTest } from '../module/begruessung/senden.js';
import { liesSprachraeume, liste as sprachkanaele, pruefe as pruefeSprachraeume, speichereSprachraeume } from '../module/sprachraeume/sprachraeume.js';

export interface ApiUmgebung {
  geheimnis: string;
  dashboard: string;
  port: number;
}

// Die Umgebung der API; undefined, wenn DISCORD_CLIENT_SECRET oder
// DASHBOARD_URL fehlt. Siehe docs/schnittstelle/anmeldung.md, „Umgebung“.
export function apiUmgebung(umgebung = process.env): ApiUmgebung | undefined {
  const { DISCORD_CLIENT_SECRET, DASHBOARD_URL, API_PORT } = umgebung;
  if (!DISCORD_CLIENT_SECRET || !DASHBOARD_URL) return undefined;
  const dashboard = DASHBOARD_URL.replace(/\/+$/, '');
  if (!URL.canParse(dashboard) || !/^https?:$/.test(new URL(dashboard).protocol)) {
    throw new Error('DASHBOARD_URL ist keine Adresse mit http oder https.');
  }
  const port = API_PORT ? Number(API_PORT) : 4174;
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error('API_PORT ist kein Port.');
  return { geheimnis: DISCORD_CLIENT_SECRET, dashboard, port };
}

export interface ApiOptionen {
  client: Client;
  db: Pool;
  // Application-ID, zugleich Client-ID für OAuth2.
  anwendung: string;
  geheimnis: string;
  dashboard: string;
  // Zählt, wie oft eine Grenze unten greift. Siehe docs/bot/rate-limits.md, „Eigene Grenzen“.
  // Zählt auch die Anfragen der Anmeldung an Discord.
  zaehlung?: Pick<Zaehlung, 'griff' | 'antwort'>;
  // Der Cache der Einstellungen; wer schreibt, löscht dort den Server.
  // Siehe docs/bot/cache.md, „So geht es“.
  einstellungen?: { delete(server: string): unknown };
  // Lädt Avatare für die Vorschau; in Tests ein Ersatz.
  avatar?: (url: string) => Promise<Buffer | undefined>;
  // Die Uhr der Grenzen, in ms; in Tests eine falsche.
  uhr?: () => number;
  // Der Cache der Sprachräume; wer schreibt, löscht dort den Server.
  sprachraeume?: { delete(server: string): unknown };
}

export type Kanal = { id: string; name: string; banner: boolean; kategorie: { id: string; name: string } | null };

// Eine Antwort mit Fehlercode. Siehe docs/schnittstelle/api.md, „Fehler“.
class ApiFehler extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly feld?: string,
    readonly kopf: OutgoingHttpHeaders = {},
  ) {
    super(code);
  }
}

// Zählt Anfragen je Schlüssel in einem gleitenden Fenster von einer Minute.
// Siehe docs/schnittstelle/api.md, „Grenzen je Sitzung“.
export class Grenze {
  private readonly zeiten = new Map<string, number[]>();

  constructor(
    private readonly hoechstens: number,
    private readonly fenster = 60_000,
    private readonly uhr = () => Date.now(),
    // Wenn die Grenze greift; für die Zählung.
    private readonly griff?: () => void,
  ) {}

  // 0, wenn die Anfrage zählt; sonst die Sekunden, bis wieder eine geht.
  pruefe(schluessel: string): number {
    const jetzt = this.uhr();
    const liste = (this.zeiten.get(schluessel) ?? []).filter((zeit) => zeit > jetzt - this.fenster);
    this.zeiten.set(schluessel, liste);
    const aelteste = liste[0];
    if (aelteste !== undefined && liste.length >= this.hoechstens) {
      this.griff?.();
      return Math.ceil((aelteste + this.fenster - jetzt) / 1000);
    }
    liste.push(jetzt);
    return 0;
  }

  // Vergisst Schlüssel ohne Anfrage im Fenster.
  raeume(): void {
    const grenze = this.uhr() - this.fenster;
    for (const [schluessel, liste] of this.zeiten) if ((liste.at(-1) ?? 0) <= grenze) this.zeiten.delete(schluessel);
  }
}

// Text- und Ankündigungskanäle, in denen der Bot sehen und senden darf,
// sortiert wie in Discord. Siehe docs/schnittstelle/api.md, „Typen“.
export function kanaele(guild: Guild): Kanal[] {
  const ich = guild.members.me;
  if (!ich) return [];
  const liste: (TextChannel | NewsChannel)[] = [];
  for (const kanal of guild.channels.cache.values()) {
    if (kanal.type !== ChannelType.GuildText && kanal.type !== ChannelType.GuildAnnouncement) continue;
    if (kanal.permissionsFor(ich).has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) liste.push(kanal);
  }
  return wieDiscord(liste).map((kanal) => ({
    id: kanal.id,
    name: kanal.name,
    banner: kanal.permissionsFor(ich).has(PermissionFlagsBits.AttachFiles),
    kategorie: kanal.parent && { id: kanal.parent.id, name: kanal.parent.name },
  }));
}

// Der Bot ist auf dem Server, und die Person darf ihn jetzt verwalten.
// Siehe docs/schnittstelle/anmeldung.md, „Rechte“.
async function pruefeRechte(client: Client, id: string, nutzer: string): Promise<{ guild: Guild; mitglied: GuildMember }> {
  const guild = client.guilds.cache.get(id);
  if (!guild) throw new ApiFehler(404, 'nicht_gefunden');
  if (!guild.available) throw new ApiFehler(503, 'nicht_erreichbar');
  const mitglied = await guild.members.fetch({ user: nutzer, force: true }).catch((fehler: unknown) => {
    const keinMitglied = [RESTJSONErrorCodes.UnknownMember, RESTJSONErrorCodes.UnknownUser];
    if (fehler instanceof DiscordAPIError && keinMitglied.includes(fehler.code as RESTJSONErrorCodes)) {
      throw new ApiFehler(403, 'kein_recht');
    }
    throw fehler;
  });
  if (!mitglied.permissions.has(PermissionFlagsBits.ManageGuild)) throw new ApiFehler(403, 'kein_recht');
  return { guild, mitglied };
}

// Liest den Body bis `grenze` Byte. Wird er grösser, hört es auf zu lesen
// und meldet 413 mit `code`.
function liesBody(req: IncomingMessage, grenze: number, code = 'zu_gross'): Promise<Buffer> {
  if (Number(req.headers['content-length'] ?? 0) > grenze) return Promise.reject(new ApiFehler(413, code));
  return new Promise((fertig, scheitern) => {
    const teile: Buffer[] = [];
    let groesse = 0;
    const daten = (teil: Buffer) => {
      groesse += teil.length;
      if (groesse <= grenze) {
        teile.push(teil);
        return;
      }
      req.off('data', daten).off('end', ende).pause();
      scheitern(new ApiFehler(413, code));
    };
    const ende = () => fertig(Buffer.concat(teile));
    req.on('data', daten).once('end', ende).once('error', scheitern);
  });
}

// JSON aus dem Body; undefined, wenn er kein JSON ist.
async function liesJson(req: IncomingMessage): Promise<unknown> {
  if (!/^application\/json\s*(;|$)/i.test(req.headers['content-type'] ?? '')) throw new ApiFehler(415, 'kein_json');
  const body = await liesBody(req, 16 * 1024);
  try {
    return JSON.parse(body.toString('utf8'));
  } catch {
    return undefined;
  }
}

interface Anfrage {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  cookies: Map<string, string>;
  teile: string[];
  sitzung?: Sitzung;
  server?: Guild;
  mitglied?: GuildMember;
}

interface Route {
  methode: string;
  muster: RegExp;
  // Für das Log; nie der Pfad, er trägt IDs.
  name: string;
  sitzung: boolean;
  // Mit {id}: Grenze und Rechte vorher.
  server: boolean;
  // Zählt auch zur Grenze für Bilder und Vorschau.
  bild?: boolean;
  tue(a: Anfrage): Promise<void>;
}

// Jede Antwort trägt diese Header. Liegt noch ungelesener Body an, schliesst
// die Verbindung danach, statt ihn zu lesen.
function sende(a: Anfrage, status: number, kopf: OutgoingHttpHeaders, body?: string | Buffer): void {
  if (a.res.headersSent) return void a.res.destroy();
  a.res.writeHead(status, {
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...(a.req.complete ? {} : { connection: 'close' }),
    ...kopf,
  });
  a.res.end(body);
}

function json(a: Anfrage, status: number, wert: unknown, kopf: OutgoingHttpHeaders = {}): void {
  const body = JSON.stringify(wert);
  sende(a, status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body), ...kopf }, body);
}

// Die API des Dashboards. Lauscht noch nicht; das tut der Aufrufer, nur auf 127.0.0.1.
// Siehe docs/schnittstelle/api.md.
export function erstelleApi(o: ApiOptionen): Server {
  const origin = new URL(o.dashboard).origin;
  const sicher = o.dashboard.startsWith('https://');
  const oauth: OAuth = {
    // Über eine eigene REST-Instanz mit der Basis des Clients.
    // Siehe docs/bot/rate-limits.md, „Anmeldung“.
    frage: oauthUeber(o.client.rest, { zaehlung: o.zaehlung }),
    anwendung: o.anwendung,
    geheimnis: o.geheimnis,
    zurueck: `${o.dashboard}/api/anmelden/zurueck`,
  };
  const zeit = o.uhr ?? (() => Date.now());
  const grenze = new Grenze(60, 60_000, zeit, () => o.zaehlung?.griff('sitzung'));
  const grenzeBild = new Grenze(20, 60_000, zeit, () => o.zaehlung?.griff('bilder'));
  // Je Server über alle Sitzungen. Siehe docs/schnittstelle/api.md, „Grenzen je Sitzung“.
  const grenzeTest = new Grenze(3, 60_000, zeit, () => o.zaehlung?.griff('testnachricht'));
  const bildtypen = new Set(['image/png', 'image/jpeg', 'image/webp']);
  const sortierer = new Intl.Collator('de');
  const anmeldungWeg = cookie('anmeldung', '', '/api/anmelden', 0, sicher);

  const routen: Route[] = [
    {
      methode: 'GET',
      muster: /^\/api\/anmelden$/,
      name: 'anmelden',
      sitzung: false,
      server: false,
      async tue(a) {
        const state = zufall();
        sende(a, 302, { location: zuDiscord(oauth, state), 'set-cookie': cookie('anmeldung', state, '/api/anmelden', anmeldeFrist, sicher) });
      },
    },
    {
      methode: 'GET',
      muster: /^\/api\/anmelden\/zurueck$/,
      name: 'anmelden/zurueck',
      sitzung: false,
      server: false,
      // Siehe docs/schnittstelle/anmeldung.md, „Ablauf“.
      async tue(a) {
        try {
          const state = a.url.searchParams.get('state');
          const erwartet = a.cookies.get('anmeldung');
          if (!state || !erwartet || !gleich(state, erwartet)) throw new Error('state fehlt oder passt nicht');
          const code = a.url.searchParams.get('code');
          if (!code) throw new Error('kein Code, die Person hat abgelehnt');
          const token = await tausche(oauth, code);
          let person;
          try {
            person = await liesPerson(oauth, token);
          } finally {
            await widerrufe(oauth, token);
          }
          const kennung = await legeSitzungAn(o.db, person);
          sende(a, 302, { location: '/dashboard/', 'set-cookie': [cookie('sitzung', kennung, '/', laufzeit, sicher), anmeldungWeg] });
        } catch (fehler) {
          console.error(`Anmeldung: ${text(fehler)}`);
          sende(a, 302, { location: '/dashboard/?fehler=anmeldung', 'set-cookie': anmeldungWeg });
        }
      },
    },
    {
      methode: 'POST',
      muster: /^\/api\/abmelden$/,
      name: 'abmelden',
      sitzung: true,
      server: false,
      async tue(a) {
        await loescheSitzung(o.db, a.sitzung!.kennung);
        sende(a, 204, { 'set-cookie': cookie('sitzung', '', '/', 0, sicher) });
      },
    },
    {
      methode: 'GET',
      muster: /^\/api\/ich$/,
      name: 'ich',
      sitzung: true,
      server: false,
      async tue(a) {
        const { nutzer, name, avatar } = a.sitzung!;
        json(a, 200, { id: nutzer, name, avatar: avatar && o.client.rest.cdn.avatar(nutzer, avatar, { size: 128 }) });
      },
    },
    {
      methode: 'GET',
      muster: /^\/api\/server$/,
      name: 'server',
      sitzung: true,
      server: false,
      async tue(a) {
        const liste = a.sitzung!.server
          .map((id) => o.client.guilds.cache.get(id))
          .filter((guild): guild is Guild => guild?.available === true)
          .map((guild) => ({ id: guild.id, name: guild.name, icon: guild.iconURL({ size: 128 }) }))
          .toSorted((x, y) => sortierer.compare(x.name, y.name));
        json(a, 200, liste);
      },
    },
    {
      methode: 'GET',
      muster: /^\/api\/server\/(\d{1,20})\/kanaele$/,
      name: 'kanaele',
      sitzung: true,
      server: true,
      async tue(a) {
        json(a, 200, kanaele(a.server!));
      },
    },
    {
      methode: 'GET',
      muster: /^\/api\/server\/(\d{1,20})\/begruessung$/,
      name: 'begruessung',
      sitzung: true,
      server: true,
      async tue(a) {
        json(a, 200, await lese(o.db, a.server!.id));
      },
    },
    {
      methode: 'PUT',
      muster: /^\/api\/server\/(\d{1,20})\/begruessung\/(beitritt|abschied)$/,
      name: 'begruessung speichern',
      sitzung: true,
      server: true,
      async tue(a) {
        const eingabe = await liesJson(a.req);
        const karte = new Map(kanaele(a.server!).map((kanal) => [kanal.id, kanal]));
        const art = a.teile[2] as Art;
        const { bild } = (await lese(o.db, a.server!.id))[art];
        const ergebnis = pruefe(eingabe, karte, bild);
        if ('code' in ergebnis) throw new ApiFehler(400, ergebnis.code, ergebnis.feld);
        await speichere(o.db, a.server!.id, art, ergebnis.einstellung);
        o.einstellungen?.delete(a.server!.id);
        json(a, 200, ergebnis.einstellung);
      },
    },
    {
      methode: 'PUT',
      muster: /^\/api\/server\/(\d{1,20})\/begruessung\/(beitritt|abschied)\/bild$/,
      name: 'bild speichern',
      sitzung: true,
      server: true,
      bild: true,
      // Siehe docs/schnittstelle/api.md, „Bild“.
      async tue(a) {
        const typ = (a.req.headers['content-type'] ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
        if (!bildtypen.has(typ)) throw new ApiFehler(415, 'bildtyp');
        const daten = await liesBody(a.req, 4 * 1024 * 1024, 'bild_zu_gross');
        const bild = await bereiteVor(daten).catch((fehler: unknown) => {
          throw fehler instanceof BildFehler ? new ApiFehler(fehler.status, fehler.code) : fehler;
        });
        await speichereBild(o.db, a.server!.id, a.teile[2] as Art, bild);
        o.einstellungen?.delete(a.server!.id);
        sende(a, 204, {});
      },
    },
    {
      methode: 'DELETE',
      muster: /^\/api\/server\/(\d{1,20})\/begruessung\/(beitritt|abschied)\/bild$/,
      name: 'bild loeschen',
      sitzung: true,
      server: true,
      async tue(a) {
        await loescheBild(o.db, a.server!.id, a.teile[2] as Art);
        o.einstellungen?.delete(a.server!.id);
        sende(a, 204, {});
      },
    },
    {
      methode: 'GET',
      muster: /^\/api\/server\/(\d{1,20})\/begruessung\/(beitritt|abschied)\/vorschau$/,
      name: 'vorschau',
      sitzung: true,
      server: true,
      bild: true,
      // Das Banner mit der angemeldeten Person als Mitglied. Siehe docs/schnittstelle/api.md, „Bild“.
      async tue(a) {
        const art = a.teile[2] as Art;
        const { bannerText } = (await lese(o.db, a.server!.id))[art];
        const png = await banner(a.mitglied!, art, bannerText, { db: o.db, avatar: o.avatar });
        if (!png) throw new ApiFehler(404, 'kein_bild');
        sende(a, 200, { 'content-type': 'image/png', 'content-length': png.length }, png);
      },
    },
    {
      methode: 'POST',
      muster: /^\/api\/server\/(\d{1,20})\/begruessung\/(beitritt|abschied)\/test$/,
      name: 'test',
      sitzung: true,
      server: true,
      bild: true,
      // Siehe docs/schnittstelle/api.md, „Testnachricht“.
      async tue(a) {
        const art = a.teile[2] as Art;
        const e = (await lese(o.db, a.server!.id))[art];
        if (!e.kanal) throw new ApiFehler(400, 'test_ohne_kanal', 'kanal');
        const kanal = kanaele(a.server!).find((k) => k.id === e.kanal);
        if (!kanal) throw new ApiFehler(400, 'kanal_unbekannt', 'kanal');
        if (e.text.trim() === '' && !(e.banner && e.bild && kanal.banner)) throw new ApiFehler(400, 'test_ohne_inhalt', 'text');
        // Erst nach Rechten und Regeln, direkt vor dem Senden: Eine fremde
        // Sitzung soll die Testnachricht eines Servers nicht sperren können.
        const warten = grenzeTest.pruefe(a.server!.id);
        if (warten > 0) throw new ApiFehler(429, 'zu_viele', undefined, { 'retry-after': String(warten) });
        json(a, 200, await sendeTest(a.mitglied!, art, e, { db: o.db, avatar: o.avatar }));
      },
    },
    {
      methode: 'GET',
      muster: /^\/api\/server\/(\d{1,20})\/sprachkanaele$/,
      name: 'sprachkanaele',
      sitzung: true,
      server: true,
      // Siehe docs/schnittstelle/sprachraeume.md, „Typen“.
      async tue(a) {
        json(a, 200, sprachkanaele(a.server!, await raeumeVon(o.db, a.server!.id)));
      },
    },
    {
      methode: 'GET',
      muster: /^\/api\/server\/(\d{1,20})\/sprachraeume$/,
      name: 'sprachraeume',
      sitzung: true,
      server: true,
      async tue(a) {
        json(a, 200, await liesSprachraeume(o.db, a.server!.id));
      },
    },
    {
      methode: 'PUT',
      muster: /^\/api\/server\/(\d{1,20})\/sprachraeume$/,
      name: 'sprachraeume speichern',
      sitzung: true,
      server: true,
      // Siehe docs/schnittstelle/sprachraeume.md, „Sprachräume einstellen“.
      async tue(a) {
        const eingabe = await liesJson(a.req);
        const ergebnis = pruefeSprachraeume(eingabe, sprachkanaele(a.server!, await raeumeVon(o.db, a.server!.id)));
        if ('code' in ergebnis) throw new ApiFehler(400, ergebnis.code, ergebnis.feld);
        await speichereSprachraeume(o.db, a.server!.id, ergebnis.sprachraeume);
        o.sprachraeume?.delete(a.server!.id);
        json(a, 200, ergebnis.sprachraeume);
      },
    },
  ];

  async function bearbeite(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://api');
    const a: Anfrage = { req, res, url, cookies: liesCookies(req.headers.cookie), teile: [] };
    let route: Route | undefined;
    for (const r of routen) {
      const treffer = r.methode === req.method ? r.muster.exec(url.pathname) : null;
      if (treffer) {
        route = r;
        a.teile = [...treffer];
        break;
      }
    }
    try {
      if (!route) throw new ApiFehler(404, 'nicht_gefunden');
      // Siehe docs/schnittstelle/anmeldung.md, „Origin“.
      if (route.methode !== 'GET' && req.headers.origin !== origin) throw new ApiFehler(403, 'origin_falsch');
      if (route.sitzung) {
        a.sitzung = await findeSitzung(o.db, a.cookies.get('sitzung'));
        if (!a.sitzung) throw new ApiFehler(401, 'nicht_angemeldet');
      }
      if (route.server) {
        // Die Grenze vor den Rechten: Eine abgelehnte Anfrage kostet Discord nichts.
        const warten = grenze.pruefe(a.sitzung!.kennung.toString('hex'));
        if (warten > 0) throw new ApiFehler(429, 'zu_viele', undefined, { 'retry-after': String(warten) });
        const wartenBild = route.bild ? grenzeBild.pruefe(a.sitzung!.kennung.toString('hex')) : 0;
        if (wartenBild > 0) throw new ApiFehler(429, 'zu_viele', undefined, { 'retry-after': String(wartenBild) });
        ({ guild: a.server, mitglied: a.mitglied } = await pruefeRechte(o.client, a.teile[1]!, a.sitzung!.nutzer));
      }
      await route.tue(a);
    } catch (fehler) {
      if (fehler instanceof ApiFehler) {
        return json(a, fehler.status, fehler.feld ? { code: fehler.code, feld: fehler.feld } : { code: fehler.code }, fehler.kopf);
      }
      console.error(`API ${route?.name ?? '?'}: ${text(fehler)}`);
      json(a, 503, { code: 'nicht_erreichbar' });
    }
  }

  const server = createServer((req, res) => void bearbeite(req, res));
  server.requestTimeout = 30_000;
  server.headersTimeout = 10_000;
  const uhr = setInterval(() => {
    grenze.raeume();
    grenzeBild.raeume();
    grenzeTest.raeume();
  }, 60_000).unref();
  server.on('close', () => clearInterval(uhr));
  return server;
}
