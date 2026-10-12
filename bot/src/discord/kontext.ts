import type { Guild, GuildMember } from 'discord.js';
import { alsMitglied, type Mitglied } from './nachrichten.js';
import { serverVon, type Server } from './server.js';

// Was ein Modul über den Server und die angemeldete Person erfährt, wenn
// die API eine Seite des Dashboards zeigt oder speichert; nur eigene Typen.
// Siehe docs/schnittstelle/baukasten.md.
export type Kontext = { server: Server; mitglied: Mitglied };

// Für die API, nach der Prüfung der Rechte.
export function kontextVon(guild: Guild, mitglied: GuildMember): Kontext {
  return { server: serverVon(guild), mitglied: alsMitglied(mitglied) };
}
