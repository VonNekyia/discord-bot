import { ChannelType, PermissionFlagsBits as R, type CategoryChannel, type Guild, type VoiceChannel } from 'discord.js';
import type { Pool } from 'pg';
import { vergleiche, wieDiscord } from './ordnung.js';

// Siehe docs/schnittstelle/sprachraeume.md, „Typen“.
export interface Erzeuger {
  kanal: string;
  kategorie: string | null;
  name: string;
  limit: number;
}

export interface Sprachraeume {
  an: boolean;
  erzeuger: Erzeuger[];
}

export type Sprachkanal = { id: string; name: string; kategorie: { id: string; name: string } | null; bereit: boolean };
export type Kategorie = { id: string; name: string; bereit: boolean };
export type Liste = { sprachkanaele: Sprachkanal[]; kategorien: Kategorie[]; ohneKategorie: { bereit: boolean } };

export function ohneEinstellung(): Sprachraeume {
  return { an: false, erzeuger: [] };
}

// Was der Bot auf dem ganzen Server braucht.
// Siehe docs/benutzung/sprachraeume.md, „Rechte und Intent“.
export const noetig = [R.ManageChannels, R.ManageRoles, R.MoveMembers, R.ViewChannel, R.Connect, R.SendMessages, R.ReadMessageHistory];

// Sprachkanäle und Kategorien mit `bereit`. Eine Kategorie ist bereit, wenn
// der Bot auf dem Server alles hat, sie ihm nichts davon nimmt und er jedes
// Recht ihrer Einträge selbst hat; er kopiert sie in jeden Raum.
// Siehe docs/schnittstelle/sprachraeume.md, „Typen“.
export function liste(guild: Guild): Liste {
  const ich = guild.members.me;
  const server = ich?.permissions;
  const ohneKategorie = server?.has(noetig) ?? false;
  const kategorien: Kategorie[] = [];
  const sprachkanaele: VoiceChannel[] = [];
  for (const kanal of guild.channels.cache.values()) {
    if (kanal.type === ChannelType.GuildVoice) sprachkanaele.push(kanal);
  }
  const alleKategorien = [...guild.channels.cache.values()].filter((k): k is CategoryChannel => k.type === ChannelType.GuildCategory);
  for (const kategorie of alleKategorien.sort(vergleiche)) {
    kategorien.push({ id: kategorie.id, name: kategorie.name, bereit: Boolean(ich && server && kategorieBereit(kategorie, ohneKategorie)) });
  }
  return {
    sprachkanaele: wieDiscord(sprachkanaele).map((kanal) => ({
      id: kanal.id,
      name: kanal.name,
      kategorie: kanal.parent && { id: kanal.parent.id, name: kanal.parent.name },
      bereit: Boolean(ich && kanal.permissionsFor(ich).has([R.ViewChannel, R.Connect, R.MoveMembers])),
    })),
    kategorien,
    ohneKategorie: { bereit: ohneKategorie },
  };
}

function kategorieBereit(kategorie: CategoryChannel, ohneKategorie: boolean): boolean {
  const ich = kategorie.guild.members.me;
  if (!ohneKategorie || !ich || !kategorie.permissionsFor(ich).has(noetig)) return false;
  return [...kategorie.permissionOverwrites.cache.values()].every((eintrag) =>
    ich.permissions.has(eintrag.allow.bitfield | eintrag.deny.bitfield),
  );
}

// Wie lang die Vorlage höchstens wird, wenn `{name}` 32 Zeichen hat.
// Siehe docs/schnittstelle/sprachraeume.md, „Sprachräume einstellen“.
export function hoechstens(vorlage: string): number {
  return vorlage.length + (vorlage.split('{name}').length - 1) * (32 - '{name}'.length);
}

export type Geprueft = { sprachraeume: Sprachraeume } | { code: string; feld: string };

// Prüft Regel für Regel in der Reihenfolge der Tabelle; bei den Erzeugern je
// Regel alle Einträge der Reihe nach. Siehe docs/schnittstelle/sprachraeume.md,
// „Sprachräume einstellen“.
export function pruefe(eingabe: unknown, l: Liste): Geprueft {
  const istObjekt = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
  const ohneNul = (x: unknown) => typeof x === 'string' && !x.includes('\0');
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
