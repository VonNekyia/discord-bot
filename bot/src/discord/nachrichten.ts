import { ChannelType, PermissionFlagsBits as R, type Client, type GuildMember, type PartialGuildMember } from 'discord.js';
import { alsDiscordFehler } from './fehler.js';
import { guildVon, serverVon, type Server } from './server.js';

// Mitglieder, Textkanäle und Nachrichten mit eigenen Typen, damit Module
// kein discord.js brauchen. Siehe docs/entwicklung/struktur.md, „Die Discord-Schicht“.

// Ein Mitglied, wie es ein Modul sieht.
export interface Mitglied {
  id: string;
  // Anzeigename auf dem Server: Spitzname, sonst globaler Name, sonst Nutzername.
  name: string;
  // Benutzername bei Discord: nur a–z, 0–9, `_` und `.`.
  benutzername: string;
  // URL des Avatars als PNG mit 256 px; ohne eigenen der Standard von Discord.
  avatar: string;
  server: { id: string; name: string; anzahl: number };
}

// Auch für ein Mitglied ausserhalb des Caches, wie `guildMemberRemove` es bringt.
export function alsMitglied(m: GuildMember | PartialGuildMember): Mitglied {
  return {
    id: m.id,
    name: m.displayName,
    benutzername: m.user.username,
    avatar: m.displayAvatarURL({ extension: 'png', size: 256 }),
    server: { id: m.guild.id, name: m.guild.name, anzahl: m.guild.memberCount },
  };
}

export interface Nachricht {
  text?: string;
  datei?: { name: string; daten: Buffer };
  // Wen die Nachricht pingen darf; sonst niemanden, auch nicht @everyone.
  pingt?: string[];
}

// Ein Textkanal, in dem der Bot sehen und senden darf.
export interface Textkanal {
  name: string;
  // Darf der Bot dort Dateien anhängen?
  anhaengen: boolean;
  // Wirft `DiscordFehler` aus bot/src/discord/fehler.ts.
  sende(n: Nachricht): Promise<void>;
}

// Der Text- oder Ankündigungskanal mit dieser ID, wenn der Bot dort sehen
// und senden darf; sonst undefined.
export function textkanal(server: Server, id: string): Textkanal | undefined {
  const guild = guildVon(server);
  const kanal = guild.channels.cache.get(id);
  const ich = guild.members.me;
  if (!ich || (kanal?.type !== ChannelType.GuildText && kanal?.type !== ChannelType.GuildAnnouncement)) return undefined;
  const rechte = kanal.permissionsFor(ich);
  if (!rechte.has([R.ViewChannel, R.SendMessages])) return undefined;
  return {
    name: kanal.name,
    anhaengen: rechte.has(R.AttachFiles),
    async sende({ text, datei, pingt = [] }) {
      try {
        await kanal.send({
          ...(text === undefined ? {} : { content: text }),
          files: datei ? [{ attachment: datei.daten, name: datei.name }] : [],
          allowedMentions: pingt.length > 0 ? { parse: [], users: pingt } : { parse: [] },
        });
      } catch (fehler) {
        throw alsDiscordFehler(fehler);
      }
    },
  };
}

// `textkanal` über die IDs von Server und Kanal, für Ereignisse und Timer,
// die nur IDs kennen.
export function textkanalAuf(client: Client): (server: string, kanal: string) => Textkanal | undefined {
  return (server, kanal) => {
    const guild = client.guilds.cache.get(server);
    return guild && textkanal(serverVon(guild), kanal);
  };
}
