import { Client, GatewayIntentBits, Options, Partials, type ClientOptions } from 'discord.js';

// Der Client von discord.js mit den Intents und Grenzen des Bots. Guilds
// für Server und Kanäle, GuildMembers und das Partial für Beitritt und
// Abschied. Siehe docs/bot/intents.md.
// Mitglieder und Nutzer behält der Cache nur für den Bot selbst.
// Siehe docs/bot/datenschutz.md, „Was der Bot speichert“.
export function erstelleClient(optionen: Partial<ClientOptions> = {}): Client {
  return new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
    partials: [Partials.GuildMember],
    makeCache: Options.cacheWithLimits({
      ...Options.DefaultMakeCacheSettings,
      GuildMemberManager: { maxSize: 0, keepOverLimit: (mitglied) => mitglied.id === mitglied.client.user?.id },
      UserManager: { maxSize: 0, keepOverLimit: (nutzer) => nutzer.id === nutzer.client.user?.id },
    }),
    ...optionen,
  });
}
