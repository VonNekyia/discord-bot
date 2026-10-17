import { PermissionFlagsBits as R } from 'discord.js';
import { DiscordFehler, uebersetzt } from './fehler.js';
import { personVon, rangVon, type Rang } from './mitglieder.js';
import type { Ziel } from './befehle.js';
import { guildVon, type Server } from './server.js';

// Bannen, kicken, eine DM schicken und Rollen lesen, für die Managed
// Commands. Jeder Aufruf an Discord wirft `DiscordFehler`.
// Siehe docs/benutzung/managed-commands.md, „Ablauf“.

// So lang darf der Grund im Audit-Log sein.
// Siehe docs/benutzung/managed-commands.md, „Ablauf“.
const auditLaenge = 512;

export const kuerze = (grund: string): string => (grund.length > auditLaenge ? grund.slice(0, auditLaenge) : grund);

// Der Bot auf dem Server: sein Rang und ob er bannen und kicken darf.
export function botAuf(server: Server): { id: string; rang: Rang; bannen: boolean; kicken: boolean } | undefined {
  const ich = guildVon(server).members.me;
  if (!ich) return undefined;
  return { id: ich.id, rang: rangVon(ich), bannen: ich.permissions.has(R.BanMembers), kicken: ich.permissions.has(R.KickMembers) };
}

// Wen eine ID nennt: als Mitglied mit Rang, sonst nur als Person; gibt es
// den Nutzer nicht, undefined. Fragt Discord, nicht den Cache.
export async function zielAuf(server: Server, id: string): Promise<Ziel | undefined> {
  const guild = guildVon(server);
  try {
    const m = await uebersetzt(() => guild.members.fetch({ user: id, force: true }));
    return { person: personVon(m.user, m), rang: rangVon(m) };
  } catch (fehler) {
    if (!(fehler instanceof DiscordFehler && fehler.code === 'kein_mitglied')) throw fehler;
  }
  try {
    const user = await uebersetzt(() => guild.client.users.fetch(id, { force: true, cache: false }));
    return { person: personVon(user) };
  } catch (fehler) {
    if (fehler instanceof DiscordFehler && fehler.code === 'kein_mitglied') return undefined;
    throw fehler;
  }
}

// Bannt, ohne Nachrichten zu löschen. `grund` geht ins Audit-Log, gekürzt.
export async function banne(server: Server, id: string, grund: string): Promise<void> {
  await uebersetzt(() => guildVon(server).members.ban(id, { deleteMessageSeconds: 0, reason: kuerze(grund) }));
}

export async function kicke(server: Server, id: string, grund: string): Promise<void> {
  await uebersetzt(() => guildVon(server).members.kick(id, kuerze(grund)));
}

// Eine DM an `id`, ohne Erwähnungen. Nimmt die Person keine DMs an, `kein_dm`.
export async function schreibe(server: Server, id: string, inhalt: string): Promise<void> {
  const client = guildVon(server).client;
  await uebersetzt(async () => {
    const dm = await client.users.createDM(id, { cache: false });
    await dm.send({ content: inhalt, allowedMentions: { parse: [] } });
  });
}

// Die Rollen des Servers für eine Auswahl: ohne `@everyone` und ohne die,
// die eine Integration verwaltet; die höchste zuerst, wie in Discord.
export function rollenAuf(server: Server): { id: string; name: string }[] {
  const guild = guildVon(server);
  return guild.roles.cache
    .filter((r) => r.id !== guild.id && !r.managed)
    .sorted((a, b) => b.position - a.position || (BigInt(a.id) < BigInt(b.id) ? -1 : 1))
    .map((r) => ({ id: r.id, name: r.name }));
}
