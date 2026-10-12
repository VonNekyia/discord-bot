import { OverwriteType, PermissionFlagsBits as R } from 'discord.js';

// Rechte-Einträge eines Raums als reine Daten: Sperren, Verstecken, Bann
// und Besitzer. Gesperrt, versteckt und gebannt stehen nur hier, in den
// Rechten des Kanals. Siehe docs/bot/sprachraeume-menue.md, „Rechte im Raum“.

export interface Eintrag {
  id: string;
  type: OverwriteType;
  allow: bigint;
  deny: bigint;
}

// Was Besitzer und Bot in jedem Raum erlaubt haben.
export const besitzerRechte = R.ViewChannel | R.Connect | R.ReadMessageHistory;
export const botRechte = R.ViewChannel | R.Connect | R.SendMessages;
// Ein Bann verbietet beides.
export const bann = R.ViewChannel | R.Connect;

export interface Raum {
  eintraege: Eintrag[];
  // Die Einträge der Kategorie; leer ohne Kategorie.
  kategorie: Eintrag[];
  // Die ID des Servers ist die ID von @everyone.
  server: string;
  besitzer: string;
  bot: string;
}

type Liste = Map<string, Eintrag>;

const alsListe = (eintraege: Eintrag[]): Liste => new Map(eintraege.map((e) => [e.id, { ...e }]));

// Ohne leere Einträge; die wirken nicht und zählen nur zur Grenze von Discord.
const alsEintraege = (liste: Liste): Eintrag[] => [...liste.values()].filter((e) => e.allow !== 0n || e.deny !== 0n);

function eintrag(liste: Liste, id: string, type: OverwriteType): Eintrag {
  const da = liste.get(id);
  if (da) return da;
  const neu = { id, type, allow: 0n, deny: 0n };
  liste.set(id, neu);
  return neu;
}

export function erlaube(liste: Liste, id: string, type: OverwriteType, rechte: bigint): void {
  const e = eintrag(liste, id, type);
  e.allow |= rechte;
  e.deny &= ~rechte;
}

function verbiete(liste: Liste, id: string, type: OverwriteType, rechte: bigint): void {
  const e = eintrag(liste, id, type);
  e.deny |= rechte;
  e.allow &= ~rechte;
}

// Setzt `rechte` für `e` so, wie die Kategorie sie für dieselbe ID hat; ohne Eintrag dort neutral.
function wieKategorie(e: Eintrag, kategorie: Eintrag[], rechte: bigint): void {
  const k = kategorie.find((x) => x.id === e.id);
  e.allow = (e.allow & ~rechte) | ((k?.allow ?? 0n) & rechte);
  e.deny = (e.deny & ~rechte) | ((k?.deny ?? 0n) & rechte);
}

const rollen = (liste: Liste) => [...liste.values()].filter((e) => e.type === OverwriteType.Role);

// Zu ist ein Recht, wenn @everyone es verboten hat und keine Rolle es erlaubt.
// Einträge für Personen zählen nicht; sie gehen Rollen vor
// (https://docs.discord.com/developers/topics/permissions#permission-overwrites).
function zu(r: Raum, recht: bigint): boolean {
  const alle = r.eintraege.find((e) => e.id === r.server);
  return !!alle && (alle.deny & recht) !== 0n && r.eintraege.every((e) => e.type !== OverwriteType.Role || (e.allow & recht) === 0n);
}

export const gesperrt = (r: Raum): boolean => zu(r, R.Connect);
export const versteckt = (r: Raum): boolean => zu(r, R.ViewChannel);

// Gebannt ist, wem der Raum Sehen und Verbinden verbietet, die Kategorie aber nicht.
export function gebannt(r: Raum): string[] {
  return r.eintraege
    .filter((e) => e.type === OverwriteType.Member && e.id !== r.besitzer && e.id !== r.bot && (e.deny & bann) === bann)
    .filter((e) => ((r.kategorie.find((k) => k.id === e.id)?.deny ?? 0n) & bann) !== bann)
    .map((e) => e.id);
}

// Verbietet `recht` für @everyone und alle Rollen und erlaubt `eigene` jedem,
// der drin ist. Wer gebannt ist, bekommt nichts.
function schliesse(r: Raum, recht: bigint, eigene: bigint, drin: string[]): Eintrag[] {
  const liste = alsListe(r.eintraege);
  verbiete(liste, r.server, OverwriteType.Role, recht);
  for (const e of rollen(liste)) verbiete(liste, e.id, OverwriteType.Role, recht);
  const draussen = new Set([...gebannt(r), r.bot]);
  for (const id of drin) if (!draussen.has(id)) erlaube(liste, id, OverwriteType.Member, eigene);
  return alsEintraege(liste);
}

// Setzt `recht` bei allen Rollen wie in der Kategorie und nimmt `eigene` den
// Personen wieder, die es erlaubt hatten; Besitzer, Bot und Gebannte bleiben.
function oeffne(r: Raum, recht: bigint, eigene: bigint): Eintrag[] {
  const liste = alsListe(r.eintraege);
  for (const e of rollen(liste)) wieKategorie(e, r.kategorie, recht);
  const bleiben = new Set([...gebannt(r), r.besitzer, r.bot]);
  for (const e of liste.values()) {
    if (e.type === OverwriteType.Member && !bleiben.has(e.id) && (e.allow & recht) !== 0n) wieKategorie(e, r.kategorie, eigene);
  }
  return alsEintraege(liste);
}

// Sperren: niemand Neues kommt hinein; wer drin ist, darf sich verbinden.
export const sperre = (r: Raum, drin: string[]) => schliesse(r, R.Connect, R.Connect, drin);
// Entsperren: Verbinden wie in der Kategorie.
export const entsperre = (r: Raum) => oeffne(r, R.Connect, R.Connect);
// Verstecken: andere sehen den Raum nicht; wer drin ist, sieht ihn und darf sich verbinden.
export const verstecke = (r: Raum, drin: string[]) => schliesse(r, R.ViewChannel, R.ViewChannel | R.Connect, drin);
// Zeigen: Sehen wie in der Kategorie. Ist der Raum gesperrt, behält jeder sein eigenes Verbinden.
export const zeige = (r: Raum) => oeffne(r, R.ViewChannel, gesperrt(r) ? R.ViewChannel : R.ViewChannel | R.Connect);

export function banne(r: Raum, ziel: string): Eintrag[] {
  const liste = alsListe(r.eintraege);
  verbiete(liste, ziel, OverwriteType.Member, bann);
  return alsEintraege(liste);
}

// Entbannen: Sehen und Verbinden wie in der Kategorie.
export function entbanne(r: Raum, ziel: string): Eintrag[] {
  const liste = alsListe(r.eintraege);
  const e = liste.get(ziel);
  if (e) wieKategorie(e, r.kategorie, bann);
  return alsEintraege(liste);
}

// Ein neuer Besitzer bekommt dieselben Rechte wie der erste.
export function mitBesitzer(r: Raum, neu: string): Eintrag[] {
  const liste = alsListe(r.eintraege);
  erlaube(liste, neu, OverwriteType.Member, besitzerRechte);
  return alsEintraege(liste);
}
