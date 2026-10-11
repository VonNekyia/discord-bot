import type { Pool } from 'pg';

export type Art = 'beitritt' | 'abschied';

// Eine Einstellung, wie die API sie liefert und nimmt.
// Siehe docs/schnittstelle/api.md, „Typen“.
export interface Einstellung {
  an: boolean;
  kanal: string | null;
  text: string;
  banner: boolean;
  bannerText: string;
  bild: boolean;
}

// Siehe docs/benutzung/begruessung.md, „Standardwerte“.
export function standard(art: Art): Einstellung {
  return art === 'beitritt'
    ? { an: false, kanal: null, text: 'Willkommen auf {server}, {nutzer}!', banner: false, bannerText: 'Willkommen, {name}!', bild: false }
    : { an: false, kanal: null, text: '{name} hat den Server verlassen.', banner: false, bannerText: 'Tschüss, {name}!', bild: false };
}

// Der längste Wert je Platzhalter, im Text und im Banner.
// Siehe docs/benutzung/begruessung.md, „Platzhalter“.
const laengste = {
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
// meldet die erste, die nicht passt. `kanaele` sind die Kanäle aus
// GET …/kanaele, `bild` sagt, ob ein Bild hochgeladen ist.
// Siehe docs/schnittstelle/api.md, „Einstellung speichern“.
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

interface Zeile {
  art: Art;
  an: boolean;
  kanal: string | null;
  text: string;
  banner: boolean;
  banner_text: string;
}

// Beide Einstellungen eines Servers; ohne Zeile die Standardwerte.
export async function lese(db: Pick<Pool, 'query'>, server: string): Promise<Record<Art, Einstellung>> {
  const { rows } = await db.query<Zeile>(
    'SELECT art, an, kanal, text, banner, banner_text FROM begruessungen WHERE server = $1',
    [server],
  );
  const ergebnis = { beitritt: standard('beitritt'), abschied: standard('abschied') };
  for (const z of rows) {
    ergebnis[z.art] = { an: z.an, kanal: z.kanal, text: z.text, banner: z.banner, bannerText: z.banner_text, bild: false };
  }
  return ergebnis;
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

// Löscht die Einstellungen eines Servers, den der Bot verlassen hat.
// Siehe docs/benutzung/begruessung.md, „Wenn etwas fehlt“.
export async function vergiss(db: Pick<Pool, 'query'>, server: string): Promise<void> {
  await db.query('DELETE FROM begruessungen WHERE server = $1', [server]);
}

// Die Shards eines Prozesses, den der ShardingManager gestartet hat.
export interface Shards {
  ids: number[];
  count: number;
}

// Löscht beim Start die Einstellungen der Server, die nicht in `server`
// stehen, und gibt ihre Zahl zurück. Mit `shards` nur unter den Servern
// dieser Shards; die anderen sieht der Prozess nicht.
// Siehe docs/bot/dashboard-api.md, „Aufräumen“.
export async function behalteNur(db: Pick<Pool, 'query'>, server: string[], shards?: Shards): Promise<number> {
  const { rowCount } = await db.query(
    `DELETE FROM begruessungen WHERE NOT (server = ANY($1))
       AND ($2::int IS NULL OR (server >> 22) % $2 = ANY($3::int[]))`,
    [server, shards?.count ?? null, shards?.ids ?? []],
  );
  return rowCount ?? 0;
}
