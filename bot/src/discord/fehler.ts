import { DiscordAPIError, RateLimitError, RESTJSONErrorCodes as Code } from 'discord.js';

// Fehler von Discord mit eigenen Codes, nur die, die ein Modul unterscheidet.
// Siehe docs/entwicklung/struktur.md, „Die Discord-Schicht“.
export type FehlerCode = 'kein_recht' | 'nicht_gefunden' | 'nicht_verbunden' | 'zu_viele_eintraege' | 'zu_schnell' | 'anderes';

// Ein Fehler von Discord mit eigenem Code. Die Meldung bleibt die von Discord;
// bei `zu_schnell` sagt `warten`, wie viele ms es noch dauert.
export class DiscordFehler extends Error {
  readonly warten?: number;

  constructor(
    readonly code: FehlerCode,
    meldung: string,
    optionen: ErrorOptions & { warten?: number } = {},
  ) {
    super(meldung, optionen);
    this.name = 'DiscordFehler';
    if (optionen.warten !== undefined) this.warten = optionen.warten;
  }
}

function codeVon(fehler: unknown): FehlerCode {
  if (fehler instanceof RateLimitError) return 'zu_schnell';
  if (!(fehler instanceof DiscordAPIError)) return 'anderes';
  switch (fehler.code) {
    case Code.MissingAccess:
    case Code.MissingPermissions:
      return 'kein_recht';
    case Code.UnknownChannel:
      return 'nicht_gefunden';
    case Code.TargetUserIsNotConnectedToVoice:
      return 'nicht_verbunden';
    case Code.MaximumNumberOfChannelPermissionOverwritesReached:
      return 'zu_viele_eintraege';
    default:
      return 'anderes';
  }
}

export function alsDiscordFehler(fehler: unknown): DiscordFehler {
  if (fehler instanceof DiscordFehler) return fehler;
  const meldung = fehler instanceof Error ? fehler.message : String(fehler);
  const warten = fehler instanceof RateLimitError ? { warten: fehler.retryAfter } : {};
  return new DiscordFehler(codeVon(fehler), meldung, { cause: fehler, ...warten });
}

// Führt einen Aufruf an Discord aus; jeder Fehler wird ein `DiscordFehler`.
export async function uebersetzt<T>(aufruf: () => Promise<T>): Promise<T> {
  try {
    return await aufruf();
  } catch (fehler) {
    throw alsDiscordFehler(fehler);
  }
}
