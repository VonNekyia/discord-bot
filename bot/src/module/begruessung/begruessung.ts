import type { Pool } from 'pg';

export type Art = 'beitritt' | 'abschied';

// Eine Einstellung, der Wert einer Seite der Begrüssung.
// Siehe docs/schnittstelle/begruessung.md, „Wert“.
export type Einstellung = {
  an: boolean;
  kanal: string | null;
  text: string;
  banner: boolean;
  bannerText: string;
  bild: boolean;
};

// Siehe docs/benutzung/begruessung.md, „Standardwerte“.
export function standard(art: Art): Einstellung {
  return art === 'beitritt'
    ? { an: false, kanal: null, text: 'Willkommen auf {server}, {nutzer}!', banner: false, bannerText: 'Willkommen, {name}!', bild: false }
    : { an: false, kanal: null, text: '{name} hat den Server verlassen.', banner: false, bannerText: 'Tschüss, {name}!', bild: false };
}

// Der längste Wert je Platzhalter, im Text und im Banner.
// Siehe docs/benutzung/begruessung.md, „Platzhalter“.
export const laengste = {
  text: { '{nutzer}': 23, '{name}': 64, '{server}': 200, '{anzahl}': 10 },
  banner: { '{nutzer}': 33, '{name}': 32, '{server}': 100, '{anzahl}': 10 },
} as const;

// So lang wird `vorlage` höchstens, wenn jeder Platzhalter seinen längsten
// Wert hat; in UTF-16-Einheiten wie `String.length`.
export function hoechstens(vorlage: string, wo: keyof typeof laengste): number {
  let laenge = vorlage.length;
  for (const [platzhalter, wert] of Object.entries(laengste[wo])) {
    laenge += (vorlage.split(platzhalter).length - 1) * (wert - platzhalter.length);
  }
  return laenge;
}

export type Geprueft = { einstellung: Einstellung } | { code: string; feld: string };

const typen = { an: 'boolean', kanal: 'kanal', text: 'string', banner: 'boolean', bannerText: 'string' } as const;

// Prüft eine Einstellung Regel für Regel in der Reihenfolge der Tabelle und
// meldet die erste, die nicht passt. `kanaele` sind die Optionen des
// Kanals, `bild` sagt, ob ein Bild hochgeladen ist.
// Siehe docs/schnittstelle/begruessung.md, „Einstellung speichern“.
export function pruefe(eingabe: unknown, kanaele: ReadonlyMap<string, { banner: boolean }>, bild: boolean): Geprueft {
  const felder = (typeof eingabe === 'object' && eingabe !== null && !Array.isArray(eingabe) ? eingabe : {}) as Record<string, unknown>;
  for (const [feld, typ] of Object.entries(typen)) {
    const wert = felder[feld];
    // PostgreSQL nimmt kein NUL in Text.
    const passt =
      typ === 'kanal' ? wert === null || typeof wert === 'string' : typeof wert === typ && (typ !== 'string' || !String(wert).includes('\0'));
    if (!passt) return { code: 'ungueltig', feld };
  }
  const { an, kanal, text, banner, bannerText } = felder as unknown as Einstellung;
  const ziel = kanal === null ? undefined : kanaele.get(kanal);
  if (kanal !== null && !ziel) return { code: 'kanal_unbekannt', feld: 'kanal' };
  if (hoechstens(text, 'text') > 2000) return { code: 'text_zu_lang', feld: 'text' };
  if (hoechstens(bannerText, 'banner') > 100) return { code: 'bannertext_zu_lang', feld: 'bannerText' };
  if (banner && !bild) return { code: 'banner_ohne_bild', feld: 'banner' };
  if (banner && !ziel?.banner) return { code: 'banner_ohne_recht', feld: 'banner' };
  if (an && kanal === null) return { code: 'an_ohne_kanal', feld: 'an' };
  if (an && text.trim() === '' && !banner) return { code: 'an_ohne_inhalt', feld: 'an' };
  return { einstellung: { an, kanal, text, banner, bannerText, bild } };
}

// Was die Platzhalter für ein Mitglied werden.
export interface Werte {
  id: string;
  name: string;
  server: string;
  anzahl: number;
}

// Setzt vor jedes ASCII-Satzzeichen einen Backslash. Discord liest dann
// keins davon als Markdown, als Erwähnung oder als Emoji; jedes Zeichen wird
// höchstens doppelt so lang. Siehe docs/benutzung/begruessung.md, „Platzhalter“.
export function maskiere(text: string): string {
  return text.replaceAll(/[!-/:-@[-`{-~]/g, '\\$&');
}

// Ersetzt die Platzhalter in einem Durchgang; ein eingesetzter Wert wird
// nicht noch einmal ersetzt. Andere Wörter in Klammern bleiben.
// Siehe docs/benutzung/begruessung.md, „Platzhalter“.
export function ersetze(vorlage: string, w: Werte, wo: 'text' | 'banner'): string {
  const imText = wo === 'text';
  const werte: Record<string, string> = {
    '{nutzer}': imText ? `<@${w.id}>` : `@${w.name}`,
    '{name}': imText ? maskiere(w.name) : w.name,
    '{server}': imText ? maskiere(w.server) : w.server,
    '{anzahl}': String(w.anzahl),
  };
  return vorlage.replaceAll(/\{(?:nutzer|name|server|anzahl)\}/g, (platzhalter) => werte[platzhalter] ?? platzhalter);
}

interface Zeile {
  art: Art;
  an: boolean;
  kanal: string | null;
  text: string;
  banner: boolean;
  banner_text: string;
}

// Beide Einstellungen eines Servers; ohne Zeile die Standardwerte. `bild`
// sagt, ob ein Bild gespeichert ist.
export async function lese(db: Pick<Pool, 'query'>, server: string): Promise<Record<Art, Einstellung>> {
  const [{ rows }, bilder] = await Promise.all([
    db.query<Zeile>('SELECT art, an, kanal, text, banner, banner_text FROM begruessungen WHERE server = $1', [server]),
    db.query<{ art: Art }>('SELECT art FROM bilder WHERE server = $1', [server]),
  ]);
  const mitBild = new Set(bilder.rows.map((z) => z.art));
  const ergebnis = { beitritt: standard('beitritt'), abschied: standard('abschied') };
  for (const z of rows) {
    ergebnis[z.art] = { an: z.an, kanal: z.kanal, text: z.text, banner: z.banner, bannerText: z.banner_text, bild: false };
  }
  for (const art of mitBild) ergebnis[art].bild = true;
  return ergebnis;
}

// Das Bild als WebP, wie `bereiteVor` es gespeichert hat.
export async function liesBild(db: Pick<Pool, 'query'>, server: string, art: Art): Promise<Buffer | undefined> {
  const { rows } = await db.query<{ daten: Buffer }>('SELECT daten FROM bilder WHERE server = $1 AND art = $2', [server, art]);
  return rows[0]?.daten;
}

export async function speichereBild(db: Pick<Pool, 'query'>, server: string, art: Art, daten: Buffer): Promise<void> {
  await db.query(
    'INSERT INTO bilder (server, art, daten) VALUES ($1, $2, $3) ON CONFLICT (server, art) DO UPDATE SET daten = EXCLUDED.daten',
    [server, art, daten],
  );
}

// Löscht das Bild und setzt `banner` auf false, in einer Anweisung.
// Siehe docs/schnittstelle/begruessung.md, „Bild“.
export async function loescheBild(db: Pick<Pool, 'query'>, server: string, art: Art): Promise<void> {
  await db.query(
    `WITH weg AS (DELETE FROM bilder WHERE server = $1 AND art = $2)
     UPDATE begruessungen SET banner = false WHERE server = $1 AND art = $2`,
    [server, art],
  );
}

export async function speichere(db: Pick<Pool, 'query'>, server: string, art: Art, e: Einstellung): Promise<void> {
  await db.query(
    `INSERT INTO begruessungen (server, art, an, kanal, text, banner, banner_text)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (server, art) DO UPDATE SET
       an = EXCLUDED.an, kanal = EXCLUDED.kanal, text = EXCLUDED.text,
       banner = EXCLUDED.banner, banner_text = EXCLUDED.banner_text`,
    [server, art, e.an, e.kanal, e.text, e.banner, e.bannerText],
  );
}
