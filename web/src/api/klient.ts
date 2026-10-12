// Ruft die API des Bots unter /api/ auf, unter demselben Origin wie die Seite.
// Typen, Routen und Fehlercodes wie in docs/schnittstelle/api.md und
// docs/schnittstelle/baukasten.md.

export type Ich = { id: string; name: string; avatar: string | null; debug: boolean };
export type Server = { id: string; name: string; icon: string | null };

// Der Baukasten. Siehe docs/schnittstelle/baukasten.md, „Typen“.
export type Wert = boolean | number | string | null | Eintrag[];
export type Eintrag = { [feld: string]: Wert };
export type Satz = { titel: string; text: string };
export type Fund = { code: string; feld?: string };
export type Option = {
  id: string;
  name: string;
  gruppe: { id: string; name: string } | null;
  merkmale: string[];
  gesperrt: { grund: string; code: string } | null;
};
export type Bedingung = { feld: string; merkmal?: string; sonst: string };

export type Schalter = { art: 'schalter'; id: string; titel: string; hilfe?: string; braucht?: Bedingung[] };
export type Auswahl = {
  art: 'auswahl';
  id: string;
  titel: string;
  hilfe?: string;
  leer: string;
  optionen: Option[];
  unbekannt: string;
  pflicht?: string;
  einmalig?: string;
};
export type Text = {
  art: 'text';
  id: string;
  titel: string;
  hilfe?: string;
  mehrzeilig: boolean;
  grenze: number;
  platzhalter: Record<string, number>;
  rechnung?: string;
  pflicht?: string;
};
export type Zahl = { art: 'zahl'; id: string; titel: string; hilfe?: string; min: number; max: number; ungueltig: string };
export type Bild = {
  art: 'bild';
  id: string;
  titel: string;
  hilfe?: string;
  typen: string[];
  groesse: number;
  pixel: { min: number; max: number };
  entfernen: string;
};
export type Vorschau = {
  art: 'vorschau';
  id: string;
  titel: string;
  alt: string;
  breite: number;
  hoehe: number;
  braucht: string;
  leer: Satz;
  fehler: Satz;
};
export type Aktion = { art: 'aktion'; id: string; titel: string; laeuft: string; hilfe?: string; ungespeichert?: string };
export type Liste = {
  art: 'liste';
  id: string;
  titel: string;
  eintrag: string;
  kopf?: string;
  hoechstens: number;
  hinzufuegen: string;
  entfernen: string;
  voll: string;
  leer: Satz;
  neu: Eintrag;
  bausteine: (Schalter | Auswahl | Text | Zahl)[];
};
export type Hinweis = { art: 'hinweis'; id: string; ton: 'info' | 'warn'; satz: Satz };
export type Baustein = Schalter | Auswahl | Text | Zahl | Bild | Vorschau | Aktion | Liste | Hinweis;

export type Seite = {
  id: string;
  titel: string;
  bausteine: Baustein[];
  daneben: Baustein[];
  wert: Eintrag;
  saetze: Record<string, Satz>;
  fund: Fund | null;
};

// Ein Fehler der API mit Status, festem Code und, bei 400, dem Feld.
// Ohne Antwort oder ohne Code im Body gilt nicht_erreichbar ab 500.
// Die Debug-Seite, siehe docs/schnittstelle/debug.md, „Typen“.
export type DebugRoute = {
  methode: string;
  route: string;
  anfragen: number;
  rateLimits: number;
  limit: number | null;
  remaining: number | null;
  resetAfter: number | null;
  zuletzt: string;
};
export type Debug = {
  seit: string;
  jetzt: string;
  shards: number[];
  routen: DebugRoute[];
  rateLimits: { anzahl: number; global: number; scope: { user: number; global: number; shared: number } };
  ungueltig: { letzte10min: number; warnung: number; grenze: number };
  eigene: { name: string; gegriffen: number }[];
};

export class ApiFehler extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly feld?: string,
    readonly warten?: number, // Sekunden aus Retry-After
  ) {
    super(code);
  }
}

async function senden(methode: string, pfad: string, body?: BodyInit, typ?: string): Promise<Response> {
  let antwort: Response;
  try {
    antwort = await fetch(pfad, { method: methode, body, headers: typ ? { 'Content-Type': typ } : {} });
  } catch {
    throw new ApiFehler(0, 'nicht_erreichbar');
  }
  if (antwort.ok) return antwort;
  const inhalt = (await antwort.json().catch(() => null)) as { code?: unknown; feld?: unknown } | null;
  const code = typeof inhalt?.code === 'string' ? inhalt.code : antwort.status >= 500 ? 'nicht_erreichbar' : 'unbekannt';
  const feld = typeof inhalt?.feld === 'string' ? inhalt.feld : undefined;
  const warten = Number(antwort.headers.get('Retry-After')) || undefined;
  throw new ApiFehler(antwort.status, code, feld, warten);
}

const json = async <T>(antwort: Response): Promise<T> => (await antwort.json()) as T;
const seiten = (id: string) => `/api/server/${encodeURIComponent(id)}/seiten`;
const baustein = (id: string, seite: string, name: string) => `${seiten(id)}/${encodeURIComponent(seite)}/${encodeURIComponent(name)}`;

export const api = {
  ich: async () => json<Ich>(await senden('GET', '/api/ich')),
  abmelden: async () => {
    await senden('POST', '/api/abmelden');
  },
  server: async () => json<Server[]>(await senden('GET', '/api/server')),
  debug: async () => json<Debug>(await senden('GET', '/api/debug')),
  seiten: async (id: string) => json<Seite[]>(await senden('GET', seiten(id))),
  speichern: async (id: string, seite: string, wert: Eintrag) =>
    json<{ wert: Eintrag; meldung: Satz }>(
      await senden('PUT', `${seiten(id)}/${encodeURIComponent(seite)}`, JSON.stringify(wert), 'application/json'),
    ),
  // Die Datei geht roh als Body, mit ihrem Typ.
  hochladen: async (id: string, seite: string, name: string, datei: File) => {
    await senden('PUT', baustein(id, seite, name), datei, datei.type);
  },
  loeschen: async (id: string, seite: string, name: string) => {
    await senden('DELETE', baustein(id, seite, name));
  },
  // Ohne Body; die Antwort ist der Satz für die Meldung.
  ausloesen: async (id: string, seite: string, name: string) => json<Satz>(await senden('POST', baustein(id, seite, name))),
  // Die Query ändert sich bei jedem Aufruf, damit der Browser neu lädt; die API ignoriert sie.
  bild: (id: string, seite: string, name: string) => `${baustein(id, seite, name)}?v=${Date.now()}`,
};
