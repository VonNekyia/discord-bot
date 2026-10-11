// Ruft die API des Bots unter /api/ auf, unter demselben Origin wie die Seite.
// Typen, Routen und Fehlercodes wie in docs/schnittstelle/api.md.

export type Art = 'beitritt' | 'abschied';
export type Ich = { id: string; name: string; avatar: string | null };
export type Server = { id: string; name: string; icon: string | null };
export type Kanal = { id: string; name: string; banner: boolean; kategorie: { id: string; name: string } | null };
export type Einstellung = {
  an: boolean;
  kanal: string | null;
  text: string;
  banner: boolean;
  bannerText: string;
  bild: boolean;
};

// Ein Fehler der API mit Status, festem Code und, bei 400, dem Feld.
// Ohne Antwort oder ohne Code im Body gilt nicht_erreichbar ab 500.
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
const begruessung = (id: string) => `/api/server/${encodeURIComponent(id)}/begruessung`;

export const api = {
  ich: async () => json<Ich>(await senden('GET', '/api/ich')),
  abmelden: async () => {
    await senden('POST', '/api/abmelden');
  },
  server: async () => json<Server[]>(await senden('GET', '/api/server')),
  kanaele: async (id: string) => json<Kanal[]>(await senden('GET', `/api/server/${encodeURIComponent(id)}/kanaele`)),
  begruessung: async (id: string) => json<Record<Art, Einstellung>>(await senden('GET', begruessung(id))),
  speichern: async (id: string, art: Art, einstellung: Omit<Einstellung, 'bild'>) =>
    json<Einstellung>(await senden('PUT', `${begruessung(id)}/${art}`, JSON.stringify(einstellung), 'application/json')),
  // Das Bild geht roh als Body, mit dem Typ der gewählten Datei.
  bildHochladen: async (id: string, art: Art, datei: File) => {
    await senden('PUT', `${begruessung(id)}/${art}/bild`, datei, datei.type);
  },
  bildLoeschen: async (id: string, art: Art) => {
    await senden('DELETE', `${begruessung(id)}/${art}/bild`);
  },
  // Ohne Body; die Testnachricht nimmt den gespeicherten Stand. `banner` sagt, ob das Banner mitging.
  testSenden: async (id: string, art: Art) => json<{ banner: boolean }>(await senden('POST', `${begruessung(id)}/${art}/test`)),
  // Die Query ändert sich bei jedem Aufruf, damit der Browser neu lädt; die API ignoriert sie.
  vorschau: (id: string, art: Art) => `${begruessung(id)}/${art}/vorschau?v=${Date.now()}`,
};
