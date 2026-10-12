import { Client, GatewayIntentBits, Options, Partials, type ClientOptions, type RateLimitData } from 'discord.js';
import { oauthFrist, oauthPfade } from './oauth.js';

// Wann `@discordjs/rest` bei einem Rate-Limit nicht wartet, sondern einen
// `RateLimitError` wirft. `PATCH /channels/:id` immer: Umbenennen kann bis
// zu 10 Minuten warten, und das Menü nennt dann die Wartezeit. Die
// Anmeldung, wenn das Warten nicht in ihre Frist passt. Alles andere, auch
// Nachrichten in `/channels/:id/messages`, wartet weiter.
// Siehe docs/bot/rate-limits.md, „Kanäle ändern“.
export function wartetNicht(daten: Pick<RateLimitData, 'method' | 'route' | 'retryAfter'>): boolean {
  if (daten.method.toUpperCase() === 'PATCH' && daten.route === '/channels/:id') return true;
  return oauthPfade.has(daten.route) && daten.retryAfter >= oauthFrist;
}

// Der Client von discord.js mit den Intents und Grenzen des Bots. Guilds
// für Server und Kanäle, GuildMembers und das Partial für Beitritt und
// Abschied, GuildVoiceStates für die Sprachräume. Siehe docs/bot/intents.md.
// Mitglieder und Nutzer behält der Cache nur für den Bot selbst; Voice
// States ohne Kanal räumt ein Sweeper alle 10 Minuten weg.
// Siehe docs/bot/datenschutz.md, „Was der Bot speichert“.
export function erstelleClient(optionen: Partial<ClientOptions> = {}): Client {
  const { rest, ...weiter } = optionen;
  return new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildVoiceStates],
    partials: [Partials.GuildMember],
    makeCache: Options.cacheWithLimits({
      ...Options.DefaultMakeCacheSettings,
      GuildMemberManager: { maxSize: 0, keepOverLimit: (mitglied) => mitglied.id === mitglied.client.user?.id },
      UserManager: { maxSize: 0, keepOverLimit: (nutzer) => nutzer.id === nutzer.client.user?.id },
    }),
    sweepers: {
      ...Options.DefaultSweeperSettings,
      voiceStates: { interval: 600, filter: () => (zustand) => zustand.channelId === null },
    },
    rest: { rejectOnRateLimit: wartetNicht, ...rest },
    ...weiter,
  });
}
