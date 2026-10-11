import { ChannelType, PermissionFlagsBits, type GuildMember, type PartialGuildMember } from 'discord.js';
import type { Pool } from 'pg';
import { holeAvatar, zeichne } from './banner.js';
import { text as fehlertext } from './befehle.js';
import { ersetze, liesBild, type Art, type Einstellung } from './begruessung.js';

// Was `begruesse` braucht: die Datenbank für das Bild und die Einstellungen
// über den Cache. Siehe docs/bot/cache.md.
export interface SendeKontext {
  db: Pick<Pool, 'query'>;
  einstellungen: { fetch(server: string): Promise<Record<Art, Einstellung> | undefined> };
  avatar?: (url: string) => Promise<Buffer | undefined>;
}

// Das Banner für ein Mitglied; undefined ohne gespeichertes Bild.
export async function banner(
  mitglied: GuildMember | PartialGuildMember,
  art: Art,
  vorlage: string,
  k: Pick<SendeKontext, 'db' | 'avatar'>,
): Promise<Buffer | undefined> {
  const hintergrund = await liesBild(k.db, mitglied.guild.id, art);
  if (!hintergrund) return undefined;
  const werte = { id: mitglied.id, name: mitglied.displayName, server: mitglied.guild.name, anzahl: mitglied.guild.memberCount };
  const avatar = await (k.avatar ?? holeAvatar)(mitglied.displayAvatarURL({ extension: 'png', size: 256 }));
  return zeichne(hintergrund, avatar, ersetze(vorlage, werte, 'banner'));
}

// Schickt die Begrüssung für `art`, wenn sie an ist und der Bot im Kanal
// darf. Ins Log gehen nur die Art und der Grund, nie IDs oder Namen.
// Siehe docs/benutzung/begruessung.md, „Wenn etwas fehlt“.
export async function begruesse(mitglied: GuildMember | PartialGuildMember, art: Art, k: SendeKontext): Promise<void> {
  const { guild } = mitglied;
  let e: Einstellung | undefined;
  try {
    e = (await k.einstellungen.fetch(guild.id))?.[art];
  } catch (fehler) {
    console.error(`Begrüssung ${art}: Einstellungen nicht gelesen: ${fehlertext(fehler)}`);
    return;
  }
  if (!e?.an || !e.kanal) return;
  const kanal = guild.channels.cache.get(e.kanal);
  const ich = guild.members.me;
  const textkanal = kanal?.type === ChannelType.GuildText || kanal?.type === ChannelType.GuildAnnouncement ? kanal : undefined;
  const rechte = textkanal && ich ? textkanal.permissionsFor(ich) : undefined;
  if (!textkanal || !rechte?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) {
    console.error(`Begrüssung ${art}: Kanal fehlt oder der Bot darf dort nicht senden.`);
    return;
  }

  const werte = { id: mitglied.id, name: mitglied.displayName, server: guild.name, anzahl: guild.memberCount };
  const text = ersetze(e.text, werte, 'text');
  let datei: Buffer | undefined;
  if (e.banner && e.bild) {
    if (!rechte.has(PermissionFlagsBits.AttachFiles)) {
      console.error(`Begrüssung ${art}: Banner ohne „Dateien anhängen“, nur der Text.`);
    } else {
      datei = await banner(mitglied, art, e.bannerText, k).catch((fehler: unknown) => {
        console.error(`Begrüssung ${art}: Banner gescheitert, nur der Text: ${fehlertext(fehler)}`);
        return undefined;
      });
    }
  }
  if (text.trim() === '' && !datei) return;

  // Beim Beitritt pingt nur das neue Mitglied, beim Abschied niemand.
  // Siehe docs/benutzung/begruessung.md, „Platzhalter“.
  const allowedMentions = art === 'beitritt' ? { parse: [], users: [mitglied.id] } : { parse: [] };
  await textkanal
    .send({
      ...(text.trim() === '' ? {} : { content: text }),
      files: datei ? [{ attachment: datei, name: `${art}.png` }] : [],
      allowedMentions,
    })
    .catch((fehler: unknown) => console.error(`Begrüssung ${art}: nicht gesendet: ${fehlertext(fehler)}`));
}
