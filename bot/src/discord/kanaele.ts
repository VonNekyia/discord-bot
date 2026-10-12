import { ChannelType, PermissionFlagsBits, type NewsChannel, type TextChannel } from 'discord.js';
import { wieDiscord } from './ordnung.js';
import { guildVon, type Server } from './server.js';

export type Kanal = { id: string; name: string; banner: boolean; kategorie: { id: string; name: string } | null };

// Text- und Ankündigungskanäle, in denen der Bot sehen und senden darf,
// sortiert wie in Discord; `banner`, wenn er dort auch Dateien anhängen darf.
// Siehe docs/schnittstelle/begruessung.md, „Bausteine“.
export function kanaele(server: Server): Kanal[] {
  const guild = guildVon(server);
  const ich = guild.members.me;
  if (!ich) return [];
  const liste: (TextChannel | NewsChannel)[] = [];
  for (const kanal of guild.channels.cache.values()) {
    if (kanal.type !== ChannelType.GuildText && kanal.type !== ChannelType.GuildAnnouncement) continue;
    if (kanal.permissionsFor(ich).has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) liste.push(kanal);
  }
  return wieDiscord(liste).map((kanal) => ({
    id: kanal.id,
    name: kanal.name,
    banner: kanal.permissionsFor(ich).has(PermissionFlagsBits.AttachFiles),
    kategorie: kanal.parent && { id: kanal.parent.id, name: kanal.parent.name },
  }));
}
