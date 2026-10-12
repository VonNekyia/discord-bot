import type { Guild, GuildMember } from 'discord.js';

// Was ein Modul über den Server und die angemeldete Person erfährt, wenn
// die API eine Seite des Dashboards zeigt oder speichert.
// Siehe docs/schnittstelle/baukasten.md.
export type Kontext = { server: Guild; mitglied: GuildMember };
