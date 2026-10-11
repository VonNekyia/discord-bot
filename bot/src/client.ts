import { Client, GatewayIntentBits, Options, type ClientOptions } from 'discord.js';

// Der Client von discord.js mit den Intents und Grenzen des Bots.
// Slash-Befehle brauchen nur Guilds. Siehe docs/bot/intents.md.
// Mitglieder und Nutzer behält der Cache nur für den Bot selbst.
// Siehe docs/bot/datenschutz.md, „Was der Bot speichert“.
export function erstelleClient(optionen: Partial<ClientOptions> = {}): Client {
  return new Client({
    intents: [GatewayIntentBits.Guilds],
    makeCache: Options.cacheWithLimits({
      ...Options.DefaultMakeCacheSettings,
      GuildMemberManager: { maxSize: 0, keepOverLimit: (mitglied) => mitglied.id === mitglied.client.user?.id },
      UserManager: { maxSize: 0, keepOverLimit: (nutzer) => nutzer.id === nutzer.client.user?.id },
    }),
    ...optionen,
  });
}
