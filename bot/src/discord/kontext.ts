import { PermissionFlagsBits, type Client, type Guild, type GuildMember } from 'discord.js';
import { DiscordFehler, uebersetzt } from './fehler.js';
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

// Warum eine Person einen Server nicht verwalten darf: Der Bot ist nicht
// auf dem Server, Discord liefert ihn gerade nicht, oder die Person ist kein
// Mitglied oder hat das Recht nicht.
export type NichtVerwalten = 'kein_server' | 'nicht_erreichbar' | 'kein_recht';

// Der Kontext, wenn der Bot auf dem Server `id` ist und `nutzer` ihn jetzt
// verwalten darf (Server verwalten); sonst der Grund. Das Mitglied fragt es
// immer neu bei Discord. Jeder andere Fehler kommt als `DiscordFehler`.
// Siehe docs/schnittstelle/anmeldung.md, „Rechte“.
export async function verwaltet(client: Client, id: string, nutzer: string): Promise<Kontext | NichtVerwalten> {
  const guild = client.guilds.cache.get(id);
  if (!guild) return 'kein_server';
  if (!guild.available) return 'nicht_erreichbar';
  const mitglied = await uebersetzt(() => guild.members.fetch({ user: nutzer, force: true })).catch((fehler: unknown) => {
    if (fehler instanceof DiscordFehler && fehler.code === 'kein_mitglied') return undefined;
    throw fehler;
  });
  if (!mitglied?.permissions.has(PermissionFlagsBits.ManageGuild)) return 'kein_recht';
  return kontextVon(guild, mitglied);
}
