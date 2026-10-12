import { DiscordAPIError, HTTPError, RateLimitError, REST, RequestMethod } from 'discord.js';
import type { Zaehlung } from '../kern/zaehlung.js';
import { zaehleAnfragen } from './zaehlen.js';

// Die vier Aufrufe der Anmeldung laufen über `@discordjs/rest` wie alle
// anderen: Sie zählen mit, und 429 behandelt die Bibliothek. Statt des
// Tokens des Bots tragen sie ihren eigenen Authorization-Header.
// Siehe docs/schnittstelle/anmeldung.md, „Ablauf“.
export interface OAuthAufruf {
  // Der Name des Schritts fürs Log, etwa `Tausch`.
  schritt: string;
  methode: 'GET' | 'POST';
  pfad: '/oauth2/token' | '/oauth2/token/revoke' | '/users/@me' | '/users/@me/guilds';
  // `Basic …` mit ID und Secret der Anwendung oder `Bearer …` mit dem Token der Person.
  kopf: string;
  // Felder für einen Body als application/x-www-form-urlencoded.
  form?: Record<string, string>;
}

export type OAuthFrage = (aufruf: OAuthAufruf) => Promise<unknown>;

// Wie lange ein Aufruf höchstens dauert, in ms, Warten auf ein Rate-Limit
// eingeschlossen. Siehe docs/bot/rate-limits.md, „Anmeldung“.
export const oauthFrist = 10_000;

// Nur Schritt und Status, nie der Body der Antwort, der Code oder der Token.
// Siehe docs/bot/datenschutz.md, „Was ins Log geht“.
function grund(fehler: unknown): string {
  if (fehler instanceof RateLimitError) return `Discord antwortet 429, Retry-After ${Math.round(fehler.retryAfter / 1000)} s`;
  if (fehler instanceof DiscordAPIError || fehler instanceof HTTPError) return `Discord antwortet ${fehler.status}`;
  if (fehler instanceof Error && (fehler.name === 'AbortError' || fehler.name === 'TimeoutError')) return 'Frist abgelaufen';
  return fehler instanceof Error ? fehler.message : String(fehler);
}

// Eine `OAuthFrage` über eine eigene REST-Instanz mit der Basis von
// `basis`, ohne Token des Bots. Eigene Instanz, weil `@discordjs/rest` die
// Buckets dieser Routen für alle Tokens zusammen führt und ein globales 429
// für die ganze Instanz gilt: Eine Person soll weder andere Anmeldungen noch
// den Bot bremsen. `zaehlung` zählt sie mit wie den Bot.
// Ein kurzes Retry-After wartet die Bibliothek ab; eins ab der Frist wirft
// sie gleich. Die Frist gilt auch, wenn die Bibliothek gerade wartet: Ihr
// Schlaf hört nicht auf `signal`, das Rennen schon.
// Siehe docs/bot/rate-limits.md, „Anmeldung“.
export function oauthUeber(basis: REST, o: { zaehlung?: Pick<Zaehlung, 'antwort'>; frist?: number } = {}): OAuthFrage {
  const frist = o.frist ?? oauthFrist;
  const rest = new REST({
    api: basis.options.api,
    version: basis.options.version,
    retries: basis.options.retries,
    timeout: basis.options.timeout,
    rejectOnRateLimit: (daten) => daten.retryAfter >= frist,
  });
  if (o.zaehlung) zaehleAnfragen(rest, o.zaehlung);
  return async ({ schritt, methode, pfad, kopf, form }) => {
    const signal = AbortSignal.timeout(frist);
    const anfrage = rest.request({
      method: methode === 'GET' ? RequestMethod.Get : RequestMethod.Post,
      fullRoute: pfad,
      auth: false,
      headers: form ? { authorization: kopf, 'content-type': 'application/x-www-form-urlencoded' } : { authorization: kopf },
      ...(form && { body: new URLSearchParams(form).toString(), passThroughBody: true }),
      signal,
    });
    const abgelaufen = new Promise<never>((_, scheitern) => {
      signal.addEventListener('abort', () => scheitern(new Error('Frist abgelaufen')), { once: true });
    });
    // Wer das Rennen verliert, darf nicht unbehandelt scheitern.
    anfrage.catch(() => undefined);
    abgelaufen.catch(() => undefined);
    try {
      return await Promise.race([anfrage, abgelaufen]);
    } catch (fehler) {
      // Ohne `cause`: Fehler von `@discordjs/rest` tragen in `requestBody` den Code oder den Token.
      // oxlint-disable-next-line preserve-caught-error
      throw new Error(`${schritt}: ${grund(fehler)}`);
    }
  };
}
