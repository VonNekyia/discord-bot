// Der Baukasten des Dashboards: Jedes Modul meldet Seiten aus Bausteinen an,
// und die Oberfläche zeigt genau diese. Die Typen sind der Vertrag mit web/.
// Siehe docs/schnittstelle/baukasten.md.

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

// Bausteine mit eigener Route und ihre Methoden.
// Siehe docs/schnittstelle/baukasten.md, „Routen“.
export const methoden = { bild: ['PUT', 'DELETE'], vorschau: ['GET'], aktion: ['POST'] } as const;
export type MitRoute = keyof typeof methoden;

// Ein erwarteter Fehler, wie die API ihn beantwortet: Status, Code, bei 400
// das Feld, bei 429 die Sekunden bis zum nächsten Versuch.
export class BausteinFehler extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly feld?: string,
    readonly warten?: number,
  ) {
    super(code);
  }
}

// Eine hochgeladene Datei: ihr Content-Type und das Lesen bis zu einer
// Grenze in Byte; darüber wird es 413 mit `code`.
export type Datei = { typ: string; lies(grenze: number, code: string): Promise<Buffer> };

// Was ein Modul für das Dashboard anmeldet. `K` ist, was die API über den
// Server und die angemeldete Person weiss. Jede Methode wirft
// `BausteinFehler` für erwartete Fehler.
export interface Bereich<K> {
  // Die IDs der Seiten, in ihrer Reihenfolge, je mit den Bausteinen, die
  // eine eigene Route haben.
  readonly seiten: Readonly<Record<string, Readonly<Record<string, MitRoute>>>>;
  zeige(k: K): Promise<Seite[]>;
  speichere(k: K, seite: string, eingabe: unknown): Promise<{ wert: Eintrag; meldung: Satz }>;
  ladeHoch?(k: K, seite: string, baustein: string, datei: Datei): Promise<void>;
  loesche?(k: K, seite: string, baustein: string): Promise<void>;
  zeichne?(k: K, seite: string, baustein: string): Promise<Buffer>;
  loeseAus?(k: K, seite: string, baustein: string): Promise<Satz>;
}

// So viele Seiten zeigt das Dashboard höchstens, eine je Tab.
export const hoechstensSeiten = 6;
