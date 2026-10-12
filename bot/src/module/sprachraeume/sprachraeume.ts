import type { Pool } from 'pg';
import type { Liste } from '../../discord/sprachkanaele.js';

// Siehe docs/schnittstelle/sprachraeume.md, „Typen“.
export type Erzeuger = {
  kanal: string;
  kategorie: string | null;
  name: string;
  limit: number;
};

export type Sprachraeume = {
  an: boolean;
  erzeuger: Erzeuger[];
};

// Sprachkanäle und Kategorien mit `bereit` liefert `sprachListe` aus der Discord-Schicht.
export type { Liste };

export function ohneEinstellung(): Sprachraeume {
  return { an: false, erzeuger: [] };
}

// Wie lang die Vorlage höchstens wird, wenn `{name}` 32 Zeichen hat.
// Siehe docs/schnittstelle/sprachraeume.md, „Sprachräume einstellen“.
export function hoechstens(vorlage: string): number {
  return vorlage.length + (vorlage.split('{name}').length - 1) * (32 - '{name}'.length);
}

export type Geprueft = { sprachraeume: Sprachraeume } | { code: string; feld: string };

function istObjekt(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function ohneNul(x: unknown): boolean {
  return typeof x === 'string' && !x.includes('\0');
}

// Prüft Regel für Regel in der Reihenfolge der Tabelle; bei den Erzeugern je
// Regel alle Einträge der Reihe nach. Siehe docs/schnittstelle/sprachraeume.md,
// „Sprachräume einstellen“.
export function pruefe(eingabe: unknown, l: Liste): Geprueft {
  if (!istObjekt(eingabe) || typeof eingabe.an !== 'boolean') return { code: 'ungueltig', feld: 'an' };
  if (!Array.isArray(eingabe.erzeuger)) return { code: 'ungueltig', feld: 'erzeuger' };
  const roh: unknown[] = eingabe.erzeuger;
  for (const [i, e] of roh.entries()) {
    if (!istObjekt(e)) return { code: 'ungueltig', feld: `erzeuger.${i}` };
    if (typeof e.kanal !== 'string') return { code: 'ungueltig', feld: `erzeuger.${i}.kanal` };
    if (e.kategorie !== null && typeof e.kategorie !== 'string') return { code: 'ungueltig', feld: `erzeuger.${i}.kategorie` };
    if (!ohneNul(e.name)) return { code: 'ungueltig', feld: `erzeuger.${i}.name` };
    if (typeof e.limit !== 'number') return { code: 'ungueltig', feld: `erzeuger.${i}.limit` };
  }
  const erzeuger = (roh as Erzeuger[]).map(({ kanal, kategorie, name, limit }) => ({ kanal, kategorie, name, limit }));
  if (erzeuger.length > 10) return { code: 'zu_viele_erzeuger', feld: 'erzeuger' };

  const kanaele = new Map(l.sprachkanaele.map((k) => [k.id, k]));
  const kategorien = new Map(l.kategorien.map((k) => [k.id, k]));
  // Darf der Bot Räume dort anlegen, wo dieser Erzeuger sie anlegt?
  const ziel = (e: Erzeuger) => {
    const id = e.kategorie ?? kanaele.get(e.kanal)?.kategorie?.id ?? null;
    return id === null ? l.ohneKategorie.bereit : kategorien.get(id)?.bereit === true;
  };
  const regeln: [string, keyof Erzeuger, (e: Erzeuger, i: number) => boolean][] = [
    ['erzeuger_unbekannt', 'kanal', (e) => kanaele.has(e.kanal)],
    ['erzeuger_ohne_recht', 'kanal', (e) => kanaele.get(e.kanal)?.bereit === true],
    ['erzeuger_doppelt', 'kanal', (e, i) => erzeuger.findIndex((x) => x.kanal === e.kanal) === i],
    ['kategorie_unbekannt', 'kategorie', (e) => e.kategorie === null || kategorien.has(e.kategorie)],
    ['kategorie_ohne_recht', 'kategorie', ziel],
    ['name_leer', 'name', (e) => e.name.trim() !== ''],
    ['name_zu_lang', 'name', (e) => hoechstens(e.name) <= 100],
    ['limit_ungueltig', 'limit', (e) => Number.isInteger(e.limit) && e.limit >= 0 && e.limit <= 99],
  ];
  for (const [code, feld, gilt] of regeln) {
    const i = erzeuger.findIndex((e, j) => !gilt(e, j));
    if (i >= 0) return { code, feld: `erzeuger.${i}.${feld}` };
  }
  if (eingabe.an && erzeuger.length === 0) return { code: 'an_ohne_erzeuger', feld: 'an' };
  return { sprachraeume: { an: eingabe.an, erzeuger } };
}

export async function liesSprachraeume(db: Pick<Pool, 'query'>, server: string): Promise<Sprachraeume> {
  const { rows } = await db.query<Sprachraeume>('SELECT an, erzeuger FROM sprachraeume WHERE server = $1', [server]);
  return rows[0] ?? ohneEinstellung();
}

export async function speichereSprachraeume(db: Pick<Pool, 'query'>, server: string, s: Sprachraeume): Promise<void> {
  await db.query(
    `INSERT INTO sprachraeume (server, an, erzeuger) VALUES ($1, $2, $3)
     ON CONFLICT (server) DO UPDATE SET an = EXCLUDED.an, erzeuger = EXCLUDED.erzeuger`,
    [server, s.an, JSON.stringify(s.erzeuger)],
  );
}
