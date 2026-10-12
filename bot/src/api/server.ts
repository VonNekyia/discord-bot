import { createServer, type IncomingMessage, type OutgoingHttpHeaders, type Server, type ServerResponse } from 'node:http';
import { DiscordAPIError, PermissionFlagsBits, RESTJSONErrorCodes, type Client, type Guild, type GuildMember } from 'discord.js';
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
import { BausteinFehler, hoechstensSeiten, methoden, type Bereich, type MitRoute } from '../kern/baukasten.js';
import { text } from '../kern/fehler.js';
import { Grenze } from '../kern/grenze.js';
import type { Zaehlung } from '../kern/zaehlung.js';
import type { Kontext } from '../discord/kontext.js';
import { oauthUeber } from '../discord/oauth.js';

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
  // Die Uhr der Grenzen, in ms; in Tests eine falsche.
  uhr?: () => number;
  // Was die Module für das Dashboard anmelden, in der Reihenfolge der Tabs.
  // Siehe docs/schnittstelle/baukasten.md.
  bereiche: Bereich<Kontext>[];
}

type Methode = (typeof methoden)[MitRoute][number];

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
  // Zählt auch zur Grenze für Bilder, Vorschau und Aktionen.
  teuer?: boolean;
  tue(a: Anfrage): Promise<void>;
}

// Server und Person einer Route mit {id}, nach der Prüfung der Rechte.
function kontext(a: Anfrage): Kontext {
  if (!a.server || !a.mitglied) throw new Error('Route ohne geprüften Server');
  return { server: a.server, mitglied: a.mitglied };
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
  const sortierer = new Intl.Collator('de');
  const anmeldungWeg = cookie('anmeldung', '', '/api/anmelden', 0, sicher);

  // Jede Seite gehört genau einem Bereich; ihre ID und die ihrer Bausteine
  // sind Teile des Pfads. Siehe docs/schnittstelle/baukasten.md, „Routen“.
  const seiten = o.bereiche.flatMap((bereich) => Object.entries(bereich.seiten).map(([id, bausteine]) => ({ id, bausteine, bereich })));
  for (const [i, { id, bausteine }] of seiten.entries()) {
    for (const name of [id, ...Object.keys(bausteine)]) if (!/^[a-z][a-zA-Z0-9]{0,31}$/.test(name)) throw new Error(`Seite ${id}: ${name} taugt nicht als Pfad.`);
    if (seiten.findIndex((s) => s.id === id) !== i) throw new Error(`Seite ${id} ist doppelt angemeldet.`);
  }
  if (seiten.length > hoechstensSeiten) throw new Error(`Mehr als ${hoechstensSeiten} Seiten.`);

  // Je Seite eine Route zum Speichern, je Baustein mit eigener Route die
  // Methoden seiner Art.
  function seitenRouten(): Route[] {
    const routen: Route[] = [];
    for (const { id, bausteine, bereich } of seiten) {
      const pfad = `^/api/server/(\\d{1,20})/seiten/${id}`;
      routen.push({
        methode: 'PUT',
        muster: new RegExp(`${pfad}$`),
        name: `seiten/${id}`,
        sitzung: true,
        server: true,
        async tue(a) {
          const eingabe = await liesJson(a.req);
          json(a, 200, await bereich.speichere(kontext(a), id, eingabe));
        },
      });
      for (const [baustein, art] of Object.entries(bausteine)) {
        const muster = new RegExp(`${pfad}/${baustein}$`);
        for (const methode of methoden[art]) {
          const tue = handlung(bereich, id, baustein, methode);
          // Hochladen, Zeichnen und Auslösen sind teuer, Löschen nicht.
          routen.push({ methode, muster, name: `seiten/${id}/${baustein}`, sitzung: true, server: true, teuer: methode !== 'DELETE', tue });
        }
      }
    }
    return routen;
  }

  // Was eine Methode an einem Baustein tut; fehlt dem Bereich die Methode,
  // startet die API nicht.
  function handlung(bereich: Bereich<Kontext>, seite: string, baustein: string, methode: Methode): Route['tue'] {
    const fehlt = (was: string) => new Error(`Seite ${seite}: ${baustein} braucht ${was}.`);
    const handlungen: Record<Methode, () => Route['tue']> = {
      PUT() {
        const ladeHoch = bereich.ladeHoch?.bind(bereich);
        if (!ladeHoch) throw fehlt('ladeHoch');
        return async (a) => {
          const typ = (a.req.headers['content-type'] ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
          await ladeHoch(kontext(a), seite, baustein, { typ, lies: (hoechstens, code) => liesBody(a.req, hoechstens, code) });
          sende(a, 204, {});
        };
      },
      DELETE() {
        const loesche = bereich.loesche?.bind(bereich);
        if (!loesche) throw fehlt('loesche');
        return async (a) => {
          await loesche(kontext(a), seite, baustein);
          sende(a, 204, {});
        };
      },
      GET() {
        const zeichne = bereich.zeichne?.bind(bereich);
        if (!zeichne) throw fehlt('zeichne');
        return async (a) => {
          const png = await zeichne(kontext(a), seite, baustein);
          sende(a, 200, { 'content-type': 'image/png', 'content-length': png.length }, png);
        };
      },
      POST() {
        const loeseAus = bereich.loeseAus?.bind(bereich);
        if (!loeseAus) throw fehlt('loeseAus');
        return async (a) => json(a, 200, await loeseAus(kontext(a), seite, baustein));
      },
    };
    return handlungen[methode]();
  }

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
      muster: /^\/api\/server\/(\d{1,20})\/seiten$/,
      name: 'seiten',
      sitzung: true,
      server: true,
      // Siehe docs/schnittstelle/baukasten.md, „Routen“.
      async tue(a) {
        const k = kontext(a);
        json(a, 200, (await Promise.all(o.bereiche.map((b) => b.zeige(k)))).flat());
      },
    },
    ...seitenRouten(),
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
        const wartenBild = route.teuer ? grenzeBild.pruefe(a.sitzung!.kennung.toString('hex')) : 0;
        if (wartenBild > 0) throw new ApiFehler(429, 'zu_viele', undefined, { 'retry-after': String(wartenBild) });
        ({ guild: a.server, mitglied: a.mitglied } = await pruefeRechte(o.client, a.teile[1]!, a.sitzung!.nutzer));
      }
      await route.tue(a);
    } catch (fehler) {
      if (fehler instanceof ApiFehler) {
        return json(a, fehler.status, fehler.feld ? { code: fehler.code, feld: fehler.feld } : { code: fehler.code }, fehler.kopf);
      }
      if (fehler instanceof BausteinFehler) {
        const kopf = fehler.warten ? { 'retry-after': String(fehler.warten) } : {};
        return json(a, fehler.status, fehler.feld ? { code: fehler.code, feld: fehler.feld } : { code: fehler.code }, kopf);
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
  }, 60_000).unref();
  server.on('close', () => clearInterval(uhr));
  return server;
}
