import type { Pool } from 'pg';
import { istObjekt, ohneNul } from '../../kern/eingabe.js';

// Die Einstellungen der Managed Commands je Server.
// Siehe docs/schnittstelle/strafen.md, „Typen“.
export type Grund = { text: string };
export type Limit = { rolle: string; bans: number; kicks: number };
export type Strafen = {
  gruende: Grund[];
  limits: Limit[];
  dm: boolean;
  dmText: string;
  entbannung: string;
  verwarnungTage: number;
};

export function ohneEinstellung(): Strafen {
  return { gruende: [], limits: [], dm: true, dmText: 'Du wurdest von {server} gebannt. Grund: {grund}', entbannung: '', verwarnungTage: 365 };
}

// Der Wert, der bei Autocomplete für „Eigener Grund …“ steht; kein Grund darf so heissen.
export const eigenerGrund = 'custom';

// Die längsten Werte der Platzhalter in `dmText`.
// Siehe docs/schnittstelle/strafen.md, „Bausteine“.
export const laengste = { server: 100, grund: 400 };

// Wie lang `dmText` höchstens wird, wenn jeder Platzhalter seinen längsten Wert hat.
export function hoechstens(vorlage: string): number {
  let laenge = vorlage.length;
  for (const [name, max] of Object.entries(laengste)) laenge += (vorlage.split(`{${name}}`).length - 1) * (max - name.length - 2);
  return laenge;
}

// Die DM beim Bann: `dmText` mit Server und Grund, darunter `entbannung`.
// In einem Durchgang: Ein Grund oder Name, der selbst `{server}` oder
// `{grund}` enthält, bleibt, wie er ist.
export function bannDm(s: Strafen, server: string, grund: string): string {
  const text = s.dmText.replaceAll(/\{(server|grund)\}/g, (_, name: string) => (name === 'server' ? server : grund));
  return s.entbannung.trim() === '' ? text : `${text}\n\n${s.entbannung}`;
}

export type Geprueft = { strafen: Strafen } | { code: string; feld: string };

const ganz = (x: number, min: number, max: number) => Number.isInteger(x) && x >= min && x <= max;

// Prüft Regel für Regel in der Reihenfolge der Tabelle; in einer Liste je
// Regel alle Einträge der Reihe nach. `rollen` sind die IDs der Optionen.
// Siehe docs/schnittstelle/strafen.md, „Managed Commands einstellen“.
export function pruefe(eingabe: unknown, rollen: ReadonlySet<string>): Geprueft {
  if (!istObjekt(eingabe)) return { code: 'ungueltig', feld: 'gruende' };
  if (!Array.isArray(eingabe.gruende)) return { code: 'ungueltig', feld: 'gruende' };
  if (!Array.isArray(eingabe.limits)) return { code: 'ungueltig', feld: 'limits' };
  const rohGruende: unknown[] = eingabe.gruende;
  const rohLimits: unknown[] = eingabe.limits;
  // Nur die bekannten Felder, aus geprüften Werten; andere fallen weg.
  const gruende: Grund[] = [];
  for (const [i, g] of rohGruende.entries()) {
    if (!istObjekt(g) || !ohneNul(g.text)) return { code: 'ungueltig', feld: `gruende.${i}.text` };
    gruende.push({ text: g.text.trim() });
  }
  const limits: Limit[] = [];
  for (const [i, l] of rohLimits.entries()) {
    if (!istObjekt(l)) return { code: 'ungueltig', feld: `limits.${i}` };
    if (typeof l.rolle !== 'string') return { code: 'ungueltig', feld: `limits.${i}.rolle` };
    if (typeof l.bans !== 'number') return { code: 'ungueltig', feld: `limits.${i}.bans` };
    if (typeof l.kicks !== 'number') return { code: 'ungueltig', feld: `limits.${i}.kicks` };
    limits.push({ rolle: l.rolle, bans: l.bans, kicks: l.kicks });
  }
  const { dm, dmText, entbannung, verwarnungTage } = eingabe;
  if (typeof dm !== 'boolean') return { code: 'ungueltig', feld: 'dm' };
  if (!ohneNul(dmText)) return { code: 'ungueltig', feld: 'dmText' };
  if (!ohneNul(entbannung)) return { code: 'ungueltig', feld: 'entbannung' };
  if (typeof verwarnungTage !== 'number') return { code: 'ungueltig', feld: 'verwarnungTage' };

  if (gruende.length > 24) return { code: 'zu_viele_gruende', feld: 'gruende' };
  const klein = gruende.map((g) => g.text.toLowerCase());
  const grundRegeln: [string, (g: Grund, i: number) => boolean][] = [
    ['grund_leer', (g) => g.text !== ''],
    ['grund_zu_lang', (g) => g.text.length <= 100],
    ['grund_reserviert', (_, i) => klein[i] !== eigenerGrund],
    ['grund_doppelt', (_, i) => klein.indexOf(klein[i] ?? '') === i],
  ];
  for (const [code, gilt] of grundRegeln) {
    const i = gruende.findIndex((g, j) => !gilt(g, j));
    if (i >= 0) return { code, feld: `gruende.${i}.text` };
  }
  if (limits.length > 25) return { code: 'zu_viele_limits', feld: 'limits' };
  const limitRegeln: [string, keyof Limit, (l: Limit, i: number) => boolean][] = [
    ['rolle_unbekannt', 'rolle', (l) => rollen.has(l.rolle)],
    ['rolle_doppelt', 'rolle', (l, i) => limits.findIndex((x) => x.rolle === l.rolle) === i],
    ['limit_ungueltig', 'bans', (l) => ganz(l.bans, 0, 100)],
    ['limit_ungueltig', 'kicks', (l) => ganz(l.kicks, 0, 100)],
  ];
  for (const [code, feld, gilt] of limitRegeln) {
    const i = limits.findIndex((l, j) => !gilt(l, j));
    if (i >= 0) return { code, feld: `limits.${i}.${feld}` };
  }
  if (hoechstens(dmText) > 1400) return { code: 'dm_zu_lang', feld: 'dmText' };
  if (entbannung.length > 500) return { code: 'entbannung_zu_lang', feld: 'entbannung' };
  if (!ganz(verwarnungTage, 30, 730)) return { code: 'verwarnung_tage_ungueltig', feld: 'verwarnungTage' };
  if (dm && dmText.trim() === '') return { code: 'dm_ohne_text', feld: 'dm' };
  return { strafen: { gruende, limits, dm, dmText, entbannung, verwarnungTage } };
}

type Zeile = { gruende: Grund[]; limits: Limit[]; dm: boolean; dm_text: string; entbannung: string; verwarnung_tage: number };

export async function liesStrafen(db: Pick<Pool, 'query'>, server: string): Promise<Strafen> {
  const { rows } = await db.query<Zeile>('SELECT gruende, limits, dm, dm_text, entbannung, verwarnung_tage FROM strafen WHERE server = $1', [server]);
  const z = rows[0];
  if (!z) return ohneEinstellung();
  return { gruende: z.gruende, limits: z.limits, dm: z.dm, dmText: z.dm_text, entbannung: z.entbannung, verwarnungTage: z.verwarnung_tage };
}

export async function speichereStrafen(db: Pick<Pool, 'query'>, server: string, s: Strafen): Promise<void> {
  await db.query(
    `INSERT INTO strafen (server, gruende, limits, dm, dm_text, entbannung, verwarnung_tage) VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (server) DO UPDATE SET gruende = EXCLUDED.gruende, limits = EXCLUDED.limits, dm = EXCLUDED.dm,
       dm_text = EXCLUDED.dm_text, entbannung = EXCLUDED.entbannung, verwarnung_tage = EXCLUDED.verwarnung_tage`,
    [server, JSON.stringify(s.gruende), JSON.stringify(s.limits), s.dm, s.dmText, s.entbannung, s.verwarnungTage],
  );
}
