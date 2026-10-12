// Nur die Meldung eines Fehlers, für das Log. Fehler von discord.js tragen in
// `url` den Token der Interaktion. Siehe docs/bot/datenschutz.md, „Was ins Log geht“.
export function text(fehler: unknown): string {
  return fehler instanceof Error ? fehler.message : String(fehler);
}
