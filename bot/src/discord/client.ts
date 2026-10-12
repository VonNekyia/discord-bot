import { Client, GatewayIntentBits, Options, Partials, type ClientOptions, type RateLimitData } from 'discord.js';

// Auf ein globales Limit wartet der Bot überall, wenn es nicht länger dauert.
const KURZ = 2_000;

// Nur `PATCH /channels/:id` wartet bei einem Rate-Limit nicht, sondern wirft
// einen `RateLimitError`: Umbenennen kann bis zu 10 Minuten warten, und das
// Menü nennt dann die Wartezeit. Ein globales Limit bis `KURZ` ms wartet auch
// dort; `global` heisst auch ein 429 der Route, wenn die Anfragen der Sekunde
// gerade verbraucht sind, darum zählt die Wartezeit. Alles andere, auch
// Nachrichten in `/channels/:id/messages`, wartet weiter. Die Anmeldung hat
// eine eigene REST-Instanz (`oauthUeber`). Siehe docs/bot/rate-limits.md, „Kanäle ändern“.
export function wartetNicht(daten: Pick<RateLimitData, 'method' | 'route' | 'global' | 'retryAfter'>): boolean {
  if (daten.global && daten.retryAfter <= KURZ) return false;
  return daten.method.toUpperCase() === 'PATCH' && daten.route === '/channels/:id';
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
