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

export type Schalter = {
  art: 'schalter';
  id: string;
  titel: string;
  hilfe?: string;
  braucht?: Bedingung[];
  gesperrt?: { grund: string; code: string };
};
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
  vergeben?: string;
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
export type Link = { art: 'link'; id: string; titel: string; url: string; hilfe?: string };
// Eine Art, die die Oberfläche nicht kennt, oder ein Baustein, der nicht zu
// seiner Beschreibung passt; die Seite zeigt ihn als Warnung an seiner Stelle.
export type Unbekannt = { art: 'unbekannt'; id: string };
export type Baustein = Schalter | Auswahl | Text | Zahl | Bild | Vorschau | Aktion | Liste | Hinweis | Link | Unbekannt;

export type Seite = {
  id: string;
  titel: string;
  bausteine: Baustein[];
  daneben: Baustein[];
  wert: Eintrag;
  saetze: Record<string, Satz>;
  fund: Fund | null;
  // Nach dem Speichern alle Seiten neu holen; fehlt es im Vertrag, false.
  alleNeu: boolean;
};

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

// Prüfer für die Antworten: Jede Antwort wird geprüft, nicht behauptet. Ein
// Prüfer ist ein Typprädikat; aus kleinen setzen sich die grossen zusammen.
// Siehe docs/frontend/dashboard.md, „Antworten prüfen“.
type Pruefer<T> = (x: unknown) => x is T;
// Je Feld von T ein Prüfer; optionale Felder prüft `vielleicht`.
type Form<T> = { [K in keyof T]-?: Pruefer<T[K]> };

const istObjekt = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const istText = (x: unknown): x is string => typeof x === 'string';
const istZahl = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const istWahr = (x: unknown): x is boolean => typeof x === 'boolean';
const istNull = (x: unknown): x is null => x === null;
const vielleicht =
  <T>(p: Pruefer<T>): Pruefer<T | undefined> =>
  (x): x is T | undefined =>
    x === undefined || p(x);
const oderNull =
  <T>(p: Pruefer<T>): Pruefer<T | null> =>
  (x): x is T | null =>
    istNull(x) || p(x);
const listeVon =
  <T>(p: Pruefer<T>): Pruefer<T[]> =>
  (x): x is T[] =>
    Array.isArray(x) && x.every((e) => p(e));
const tabelleVon =
  <T>(p: Pruefer<T>): Pruefer<Record<string, T>> =>
  (x): x is Record<string, T> =>
    istObjekt(x) && Object.values(x).every((w) => p(w));
const genau =
  <T extends string>(...werte: T[]): Pruefer<T> =>
  (x): x is T =>
    werte.some((w) => w === x);
const form =
  <T>(felder: Form<T>): Pruefer<T> =>
  (x): x is T => {
    if (!istObjekt(x)) return false;
    for (const feld in felder) if (!felder[feld](x[feld])) return false;
    return true;
  };

const istIch = form<Ich>({ id: istText, name: istText, avatar: oderNull(istText), debug: istWahr });
const istServer = form<Server>({ id: istText, name: istText, icon: oderNull(istText) });
const istSatz = form<Satz>({ titel: istText, text: istText });
const istFund = form<Fund>({ code: istText, feld: vielleicht(istText) });
const istWert = (x: unknown): x is Wert => istWahr(x) || istZahl(x) || istText(x) || istNull(x) || listeVon(istEintrag)(x);
function istEintrag(x: unknown): x is Eintrag {
  return istObjekt(x) && Object.values(x).every(istWert);
}
const istOption = form<Option>({
  id: istText,
  name: istText,
  gruppe: oderNull(form<{ id: string; name: string }>({ id: istText, name: istText })),
  merkmale: listeVon(istText),
  gesperrt: oderNull(form<{ grund: string; code: string }>({ grund: istText, code: istText })),
});
const istBedingung = form<Bedingung>({ feld: istText, merkmal: vielleicht(istText), sonst: istText });

// Je Art ihre Felder aus dem Vertrag. Siehe docs/schnittstelle/baukasten.md, „Typen“.
const istSchalter = form<Schalter>({
  art: genau('schalter'),
  id: istText,
  titel: istText,
  hilfe: vielleicht(istText),
  braucht: vielleicht(listeVon(istBedingung)),
  gesperrt: vielleicht(form<{ grund: string; code: string }>({ grund: istText, code: istText })),
});
const istAuswahl = form<Auswahl>({
  art: genau('auswahl'),
  id: istText,
  titel: istText,
  hilfe: vielleicht(istText),
  leer: istText,
  optionen: listeVon(istOption),
  unbekannt: istText,
  pflicht: vielleicht(istText),
  einmalig: vielleicht(istText),
  vergeben: vielleicht(istText),
});
const istTextBaustein = form<Text>({
  art: genau('text'),
  id: istText,
  titel: istText,
  hilfe: vielleicht(istText),
  mehrzeilig: istWahr,
  grenze: istZahl,
  platzhalter: tabelleVon(istZahl),
  rechnung: vielleicht(istText),
  pflicht: vielleicht(istText),
});
const istZahlBaustein = form<Zahl>({ art: genau('zahl'), id: istText, titel: istText, hilfe: vielleicht(istText), min: istZahl, max: istZahl, ungueltig: istText });
const istBild = form<Bild>({
  art: genau('bild'),
  id: istText,
  titel: istText,
  hilfe: vielleicht(istText),
  typen: listeVon(istText),
  groesse: istZahl,
  pixel: form<{ min: number; max: number }>({ min: istZahl, max: istZahl }),
  entfernen: istText,
});
const istVorschau = form<Vorschau>({
  art: genau('vorschau'),
  id: istText,
  titel: istText,
  alt: istText,
  breite: istZahl,
  hoehe: istZahl,
  braucht: istText,
  leer: istSatz,
  fehler: istSatz,
});
const istAktion = form<Aktion>({ art: genau('aktion'), id: istText, titel: istText, laeuft: istText, hilfe: vielleicht(istText), ungespeichert: vielleicht(istText) });
// In einer Liste nur diese vier Arten; passt einer nicht, passt die ganze Liste nicht.
const istInListe = (x: unknown): x is Schalter | Auswahl | Text | Zahl => istSchalter(x) || istAuswahl(x) || istTextBaustein(x) || istZahlBaustein(x);
const istListe = form<Liste>({
  art: genau('liste'),
  id: istText,
  eintrag: istText,
  kopf: vielleicht(istText),
  hoechstens: istZahl,
  hinzufuegen: istText,
  entfernen: istText,
  voll: istText,
  leer: istSatz,
  neu: istEintrag,
  bausteine: listeVon(istInListe),
});
const istHinweis = form<Hinweis>({ art: genau('hinweis'), id: istText, ton: genau('info', 'warn'), satz: istSatz });
// Nur Links zu Discord; jeder andere passt nicht. Siehe docs/schnittstelle/baukasten.md, „Bausteine“.
const istDiscordUrl = (x: unknown): x is string => istText(x) && x.startsWith('https://discord.com/') && URL.canParse(x);
const istLink = form<Link>({ art: genau('link'), id: istText, titel: istText, url: istDiscordUrl, hilfe: vielleicht(istText) });

// Ein Baustein, wie er passt, sonst `unbekannt` mit seiner ID; ohne ID mit `ersatz`,
// damit zwei solche sich auf der Seite nicht überschreiben.
function alsBaustein(x: unknown, ersatz: string): Baustein {
  if (istSchalter(x) || istAuswahl(x) || istTextBaustein(x) || istZahlBaustein(x) || istBild(x)) return x;
  if (istVorschau(x) || istAktion(x) || istListe(x) || istHinweis(x) || istLink(x)) return x;
  return { art: 'unbekannt', id: istObjekt(x) && istText(x.id) ? x.id : ersatz };
}

// Der äussere Aufbau einer Seite muss passen, sonst gilt die ganze Antwort
// als nicht erreichbar. Siehe docs/schnittstelle/baukasten.md, „Bausteine“.
function alsSeite(x: unknown): Seite | undefined {
  if (!istObjekt(x) || !istText(x.id) || !istText(x.titel) || !Array.isArray(x.bausteine) || !Array.isArray(x.daneben)) return undefined;
  if (!istEintrag(x.wert) || !tabelleVon(istSatz)(x.saetze) || !oderNull(istFund)(x.fund) || !vielleicht(istWahr)(x.alleNeu)) return undefined;
  return {
    id: x.id,
    titel: x.titel,
    bausteine: x.bausteine.map((b, i) => alsBaustein(b, `unbekannt-${i}`)),
    daneben: x.daneben.map((b, i) => alsBaustein(b, `unbekannt-daneben-${i}`)),
    wert: x.wert,
    saetze: x.saetze,
    fund: x.fund,
    alleNeu: x.alleNeu === true,
  };
}
function alsSeiten(x: unknown): Seite[] | undefined {
  if (!Array.isArray(x)) return undefined;
  const seiten = x.map(alsSeite);
  return seiten.every((s) => s !== undefined) ? seiten.filter((s) => s !== undefined) : undefined;
}

const istDebug = form<Debug>({
  seit: istText,
  jetzt: istText,
  shards: listeVon(istZahl),
  routen: listeVon(
    form<DebugRoute>({
      methode: istText,
      route: istText,
      anfragen: istZahl,
      rateLimits: istZahl,
      limit: oderNull(istZahl),
      remaining: oderNull(istZahl),
      resetAfter: oderNull(istZahl),
      zuletzt: istText,
    }),
  ),
  rateLimits: form<Debug['rateLimits']>({
    anzahl: istZahl,
    global: istZahl,
    scope: form<Debug['rateLimits']['scope']>({ user: istZahl, global: istZahl, shared: istZahl }),
  }),
  ungueltig: form<Debug['ungueltig']>({ letzte10min: istZahl, warnung: istZahl, grenze: istZahl }),
  eigene: listeVon(form<{ name: string; gegriffen: number }>({ name: istText, gegriffen: istZahl })),
});

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
  const inhalt: unknown = await antwort.json().catch(() => null);
  const code = istObjekt(inhalt) && istText(inhalt.code) ? inhalt.code : antwort.status >= 500 ? 'nicht_erreichbar' : 'unbekannt';
  const feld = istObjekt(inhalt) && istText(inhalt.feld) ? inhalt.feld : undefined;
  const warten = Number(antwort.headers.get('Retry-After')) || undefined;
  throw new ApiFehler(antwort.status, code, feld, warten);
}

// Liest JSON und prüft es; passt es nicht, gilt die Antwort wie eine ohne
// JSON als nicht erreichbar.
async function lese<T>(antwort: Response, wandle: (x: unknown) => T | undefined): Promise<T> {
  const inhalt: unknown = await antwort.json().catch(() => undefined);
  const wert = wandle(inhalt);
  if (wert === undefined) throw new ApiFehler(antwort.status, 'nicht_erreichbar');
  return wert;
}
const wenn =
  <T>(p: Pruefer<T>) =>
  (x: unknown): T | undefined =>
    p(x) ? x : undefined;
const seiten = (id: string) => `/api/server/${encodeURIComponent(id)}/seiten`;
const baustein = (id: string, seite: string, name: string) => `${seiten(id)}/${encodeURIComponent(seite)}/${encodeURIComponent(name)}`;

export const api = {
  ich: async () => lese(await senden('GET', '/api/ich'), wenn(istIch)),
  abmelden: async () => {
    await senden('POST', '/api/abmelden');
  },
  server: async () => lese(await senden('GET', '/api/server'), wenn(listeVon(istServer))),
  debug: async () => lese(await senden('GET', '/api/debug'), wenn(istDebug)),
  seiten: async (id: string) => lese(await senden('GET', seiten(id)), alsSeiten),
  speichern: async (id: string, seite: string, wert: Eintrag) =>
    lese(
      await senden('PUT', `${seiten(id)}/${encodeURIComponent(seite)}`, JSON.stringify(wert), 'application/json'),
      wenn(form<{ wert: Eintrag; meldung: Satz }>({ wert: istEintrag, meldung: istSatz })),
    ),
  // Die Datei geht roh als Body, mit ihrem Typ.
  hochladen: async (id: string, seite: string, name: string, datei: File) => {
    await senden('PUT', baustein(id, seite, name), datei, datei.type);
  },
  loeschen: async (id: string, seite: string, name: string) => {
    await senden('DELETE', baustein(id, seite, name));
  },
  // Ohne Body; die Antwort ist der Satz für die Meldung.
  ausloesen: async (id: string, seite: string, name: string) => lese(await senden('POST', baustein(id, seite, name)), wenn(istSatz)),
  // Die Query ändert sich bei jedem Aufruf, damit der Browser neu lädt; die API ignoriert sie.
  bild: (id: string, seite: string, name: string) => `${baustein(id, seite, name)}?v=${Date.now()}`,
};
