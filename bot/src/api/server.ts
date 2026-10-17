import { createServer, type IncomingMessage, type OutgoingHttpHeaders, type Server, type ServerResponse } from 'node:http';
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
import { Zaehlung } from '../kern/zaehlung.js';
import type { DashboardGriff } from '../discord/dashboard.js';
import type { Kontext, NichtVerwalten } from '../discord/kontext.js';

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
  // Was die API von Discord braucht, aus `dashboardGriff`.
  griff: DashboardGriff;
  db: Pool;
  // Application-ID, zugleich Client-ID für OAuth2.
  anwendung: string;
  geheimnis: string;
  dashboard: string;
  // Zählt, wie oft eine Grenze unten greift. Siehe docs/bot/rate-limits.md, „Eigene Grenzen“.
  // Ohne Angabe eine eigene, die nur die API zählt.
  zaehlung?: Pick<Zaehlung, 'griff'>;
  // Die Uhr der Grenzen, in ms; in Tests eine falsche.
  uhr?: () => number;
  // Was die Module für das Dashboard anmelden, in der Reihenfolge der Tabs.
  // Siehe docs/schnittstelle/baukasten.md.
  bereiche: Bereich<Kontext>[];
  // Ob das Modul eines Bereichs auf dem Server an ist; ohne Angabe immer.
  // Siehe docs/schnittstelle/module.md, „Ein Modul ist aus“.
  istAn?(bereich: Bereich<Kontext>, server: string): Promise<boolean>;
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

// Status und Code, wenn eine Person einen Server nicht verwalten darf.
// Siehe docs/schnittstelle/anmeldung.md, „Rechte“.
const nichtVerwalten: Record<NichtVerwalten, [number, string]> = {
  kein_server: [404, 'nicht_gefunden'],
  nicht_erreichbar: [503, 'nicht_erreichbar'],
  kein_recht: [403, 'kein_recht'],
};

// Ist die Grenze für `schluessel` erreicht, 429 mit Retry-After.
// Siehe docs/bot/dashboard-api.md, „Grenzen und Zeitlimits“.
function halte(grenze: Grenze, schluessel: string): void {
  const warten = grenze.pruefe(schluessel);
  if (warten > 0) throw new ApiFehler(429, 'zu_viele', undefined, { 'retry-after': String(warten) });
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
}

// Eine Anfrage mit gültiger Sitzung.
interface MitSitzung extends Anfrage {
  sitzung: Sitzung;
}

// Eine Anfrage an einen Server, nach Grenzen und Prüfung der Rechte.
interface MitServer extends MitSitzung {
  kontext: Kontext;
}

interface Pfad {
  methode: string;
  muster: RegExp;
  // Für das Log; nie der Pfad, er trägt IDs.
  name: string;
}

// Eine Route nach Zugang; was `tue` bekommt, hat `fuehreAus` vorher
// geprüft. Siehe docs/bot/dashboard-api.md, „Ablauf einer Anfrage“.
type Route =
  | (Pfad & { zugang: 'offen'; tue(a: Anfrage): Promise<void> })
  // `grenze`: zählt zur Grenze je Sitzung, etwa GET /api/debug.
  | (Pfad & { zugang: 'sitzung'; grenze?: boolean; tue(a: MitSitzung): Promise<void> })
  // `muster` fängt als erste Gruppe die ID des Servers. Immer mit Grenze je
  // Sitzung und Rechten; `teuer` zählt auch zur Grenze für Bilder, Vorschau und Aktionen.
  | (Pfad & { zugang: 'server'; teuer?: boolean; tue(a: MitServer): Promise<void> });

type ServerRoute = Extract<Route, { zugang: 'server' }>;

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

// Was eine Methode an einem Baustein tut; fehlt dem Bereich die Methode,
// startet die API nicht.
function handlung(bereich: Bereich<Kontext>, seite: string, baustein: string, methode: Methode): ServerRoute['tue'] {
  const fehlt = (was: string) => new Error(`Seite ${seite}: ${baustein} braucht ${was}.`);
  const handlungen: Record<Methode, () => ServerRoute['tue']> = {
    PUT() {
      const ladeHoch = bereich.ladeHoch?.bind(bereich);
      if (!ladeHoch) throw fehlt('ladeHoch');
      return async (a) => {
        const typ = (a.req.headers['content-type'] ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
        await ladeHoch(a.kontext, seite, baustein, { typ, lies: (hoechstens, code) => liesBody(a.req, hoechstens, code) });
        sende(a, 204, {});
      };
    },
    DELETE() {
      const loesche = bereich.loesche?.bind(bereich);
      if (!loesche) throw fehlt('loesche');
      return async (a) => {
        await loesche(a.kontext, seite, baustein);
        sende(a, 204, {});
      };
    },
    GET() {
      const zeichne = bereich.zeichne?.bind(bereich);
      if (!zeichne) throw fehlt('zeichne');
      return async (a) => {
        const png = await zeichne(a.kontext, seite, baustein);
        sende(a, 200, { 'content-type': 'image/png', 'content-length': png.length }, png);
      };
    },
    POST() {
      const loeseAus = bereich.loeseAus?.bind(bereich);
      if (!loeseAus) throw fehlt('loeseAus');
      return async (a) => json(a, 200, await loeseAus(a.kontext, seite, baustein));
    },
  };
  return handlungen[methode]();
}

// Die API des Dashboards. Lauscht noch nicht; das tut der Aufrufer, nur auf 127.0.0.1.
// Siehe docs/schnittstelle/api.md.
export function erstelleApi(o: ApiOptionen): Server {
  const origin = new URL(o.dashboard).origin;
  const sicher = o.dashboard.startsWith('https://');
  const zaehlung = o.zaehlung ?? new Zaehlung();
  const oauth: OAuth = {
    frage: o.griff.frage,
    anwendung: o.anwendung,
    geheimnis: o.geheimnis,
    zurueck: `${o.dashboard}/api/anmelden/zurueck`,
  };
  const zeit = o.uhr ?? (() => Date.now());
  const grenze = new Grenze(60, 60_000, zeit, () => zaehlung.griff('sitzung'));
  const grenzeBild = new Grenze(20, 60_000, zeit, () => zaehlung.griff('bausteine'));
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
  const istAn = (bereich: Bereich<Kontext>, server: string) => o.istAn?.(bereich, server) ?? Promise.resolve(true);
  // Nach Sitzung, Grenzen und Rechten: Ist das Modul aus, 409.
  const nurAn =
    (bereich: Bereich<Kontext>, tue: ServerRoute['tue']): ServerRoute['tue'] =>
    async (a) => {
      if (!(await istAn(bereich, a.kontext.server.id))) throw new ApiFehler(409, 'modul_aus');
      await tue(a);
    };

  function seitenRouten(): ServerRoute[] {
    const routen: ServerRoute[] = [];
    for (const { id, bausteine, bereich } of seiten) {
      const pfad = `^/api/server/(\\d{1,20})/seiten/${id}`;
      routen.push({
        methode: 'PUT',
        muster: new RegExp(`${pfad}$`),
        name: `seiten/${id}`,
        zugang: 'server',
        tue: nurAn(bereich, async (a) => {
          const eingabe = await liesJson(a.req);
          json(a, 200, await bereich.speichere(a.kontext, id, eingabe));
        }),
      });
      for (const [baustein, art] of Object.entries(bausteine)) {
        const muster = new RegExp(`${pfad}/${baustein}$`);
        for (const methode of methoden[art]) {
          const tue = nurAn(bereich, handlung(bereich, id, baustein, methode));
          // Hochladen, Zeichnen und Auslösen sind teuer, Löschen nicht.
          routen.push({ methode, muster, name: `seiten/${id}/${baustein}`, zugang: 'server', teuer: methode !== 'DELETE', tue });
        }
      }
    }
    return routen;
  }

  const routen: Route[] = [
    {
      methode: 'GET',
      muster: /^\/api\/anmelden$/,
      name: 'anmelden',
      zugang: 'offen',
      async tue(a) {
        const state = zufall();
        sende(a, 302, { location: zuDiscord(oauth, state), 'set-cookie': cookie('anmeldung', state, '/api/anmelden', anmeldeFrist, sicher) });
      },
    },
    {
      methode: 'GET',
      muster: /^\/api\/anmelden\/zurueck$/,
      name: 'anmelden/zurueck',
      zugang: 'offen',
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
      zugang: 'sitzung',
      async tue(a) {
        await loescheSitzung(o.db, a.sitzung.kennung);
        sende(a, 204, { 'set-cookie': cookie('sitzung', '', '/', 0, sicher) });
      },
    },
    {
      methode: 'GET',
      muster: /^\/api\/ich$/,
      name: 'ich',
      zugang: 'sitzung',
      async tue(a) {
        const { nutzer, name, avatar } = a.sitzung;
        // `GET /api/ich` scheitert nicht daran, dass Discord die Anwendung nicht liefert.
        const debug = await o.griff.darfDebug(nutzer).catch((fehler: unknown) => {
          console.error(`API ich: Eigentümer nicht gelesen: ${text(fehler)}`);
          return false;
        });
        json(a, 200, { id: nutzer, name, avatar: avatar && o.griff.avatar(nutzer, avatar), debug });
      },
    },
    {
      methode: 'GET',
      muster: /^\/api\/debug$/,
      name: 'debug',
      zugang: 'sitzung',
      grenze: true,
      // Scheitert das Lesen der Anwendung, wird es wie jeder andere Fehler 503.
      // Siehe docs/schnittstelle/debug.md.
      async tue(a) {
        if (!(await o.griff.darfDebug(a.sitzung.nutzer))) throw new ApiFehler(403, 'kein_recht');
        json(a, 200, o.griff.debug());
      },
    },
    {
      methode: 'GET',
      muster: /^\/api\/server$/,
      name: 'server',
      zugang: 'sitzung',
      async tue(a) {
        const liste = o.griff.server(a.sitzung.server).toSorted((x, y) => sortierer.compare(x.name, y.name));
        json(a, 200, liste);
      },
    },
    {
      methode: 'GET',
      muster: /^\/api\/server\/(\d{1,20})\/seiten$/,
      name: 'seiten',
      zugang: 'server',
      // Siehe docs/schnittstelle/baukasten.md, „Routen“.
      async tue(a) {
        const an = await Promise.all(o.bereiche.map((b) => istAn(b, a.kontext.server.id)));
        const sichtbar = await Promise.all(o.bereiche.filter((_, i) => an[i]).map((b) => b.zeige(a.kontext)));
        json(a, 200, sichtbar.flat());
      },
    },
    ...seitenRouten(),
  ];

  // Prüft, was der Zugang der Route verlangt, und gibt ihr das Ergebnis.
  async function fuehreAus(route: Route, a: Anfrage, treffer: RegExpExecArray): Promise<void> {
    if (route.zugang === 'offen') return route.tue(a);
    const sitzung = await findeSitzung(o.db, a.cookies.get('sitzung'));
    if (!sitzung) throw new ApiFehler(401, 'nicht_angemeldet');
    const schluessel = sitzung.kennung.toString('hex');
    if (route.zugang === 'sitzung') {
      if (route.grenze) halte(grenze, schluessel);
      return route.tue({ ...a, sitzung });
    }
    // Die Grenzen vor den Rechten: Eine abgelehnte Anfrage kostet Discord nichts.
    halte(grenze, schluessel);
    if (route.teuer) halte(grenzeBild, schluessel);
    const id = treffer[1];
    if (id === undefined) throw new Error(`Route ${route.name} ohne ID des Servers`);
    const kontext = await o.griff.verwaltet(id, sitzung.nutzer);
    if (typeof kontext === 'string') throw new ApiFehler(...nichtVerwalten[kontext]);
    return route.tue({ ...a, sitzung, kontext });
  }

  async function bearbeite(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://api');
    const a: Anfrage = { req, res, url, cookies: liesCookies(req.headers.cookie) };
    let gefunden: { route: Route; treffer: RegExpExecArray } | undefined;
    for (const route of routen) {
      const treffer = route.methode === req.method ? route.muster.exec(url.pathname) : null;
      if (treffer) {
        gefunden = { route, treffer };
        break;
      }
    }
    try {
      if (!gefunden) throw new ApiFehler(404, 'nicht_gefunden');
      // Siehe docs/schnittstelle/anmeldung.md, „Origin“.
      if (gefunden.route.methode !== 'GET' && req.headers.origin !== origin) throw new ApiFehler(403, 'origin_falsch');
      await fuehreAus(gefunden.route, a, gefunden.treffer);
    } catch (fehler) {
      if (fehler instanceof ApiFehler) {
        return json(a, fehler.status, fehler.feld ? { code: fehler.code, feld: fehler.feld } : { code: fehler.code }, fehler.kopf);
      }
      if (fehler instanceof BausteinFehler) {
        const kopf = fehler.warten ? { 'retry-after': String(fehler.warten) } : {};
        return json(a, fehler.status, fehler.feld ? { code: fehler.code, feld: fehler.feld } : { code: fehler.code }, kopf);
      }
      console.error(`API ${gefunden?.route.name ?? '?'}: ${text(fehler)}`);
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
