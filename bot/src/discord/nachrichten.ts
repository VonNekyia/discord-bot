import {
  ChannelType,
  DiscordAPIError,
  PermissionFlagsBits as R,
  RateLimitError,
  RESTJSONErrorCodes as Code,
  type Client,
  type Guild,
  type GuildMember,
  type PartialGuildMember,
} from 'discord.js';

// Mitglieder, Textkanäle und Nachrichten mit eigenen Typen, damit Module
// kein discord.js brauchen. Siehe docs/entwicklung/struktur.md, „Die Discord-Schicht“.

// Ein Mitglied, wie es ein Modul sieht.
export interface Mitglied {
  id: string;
  // Anzeigename auf dem Server: Spitzname, sonst globaler Name, sonst Nutzername.
  name: string;
  // URL des Avatars als PNG mit 256 px; ohne eigenen der Standard von Discord.
  avatar: string;
  server: { id: string; name: string; anzahl: number };
}

// Auch für ein Mitglied ausserhalb des Caches, wie `guildMemberRemove` es bringt.
export function alsMitglied(m: GuildMember | PartialGuildMember): Mitglied {
  return {
    id: m.id,
    name: m.displayName,
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

export type FehlerCode = 'kein_recht' | 'nicht_gefunden' | 'zu_schnell' | 'anderes';

// Ein Fehler von Discord mit eigenem Code. Die Meldung bleibt die von Discord.
export class DiscordFehler extends Error {
  constructor(
    readonly code: FehlerCode,
    meldung: string,
    optionen?: ErrorOptions,
  ) {
    super(meldung, optionen);
    this.name = 'DiscordFehler';
  }
}

function fehlerCode(fehler: unknown): FehlerCode {
  if (fehler instanceof RateLimitError) return 'zu_schnell';
  if (!(fehler instanceof DiscordAPIError)) return 'anderes';
  if (fehler.code === Code.MissingAccess || fehler.code === Code.MissingPermissions) return 'kein_recht';
  if (fehler.code === Code.UnknownChannel) return 'nicht_gefunden';
  return 'anderes';
}

// Ein Textkanal, in dem der Bot sehen und senden darf.
export interface Textkanal {
  name: string;
  // Darf der Bot dort Dateien anhängen?
  anhaengen: boolean;
  // Wirft `DiscordFehler`.
  sende(n: Nachricht): Promise<void>;
}

// Der Text- oder Ankündigungskanal mit dieser ID, wenn der Bot dort sehen
// und senden darf; sonst undefined.
export function textkanal(guild: Guild, id: string): Textkanal | undefined {
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
        throw new DiscordFehler(fehlerCode(fehler), fehler instanceof Error ? fehler.message : String(fehler), { cause: fehler });
      }
    },
  };
}

// `textkanal` über die IDs von Server und Kanal, für Ereignisse und Timer,
// die nur IDs kennen.
export function textkanalAuf(client: Client): (server: string, kanal: string) => Textkanal | undefined {
  return (server, kanal) => {
    const guild = client.guilds.cache.get(server);
    return guild && textkanal(guild, kanal);
  };
}
