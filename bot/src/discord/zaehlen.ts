import { RESTEvents, type Client, type REST } from 'discord.js';
import { text } from '../kern/fehler.js';
import type { Debug, Zaehlung } from '../kern/zaehlung.js';

// Gibt jede Antwort von Discord an `rest` an die Zählung: Methode, Pfad,
// Status und Header. Den Body fasst der Bot nicht an; ihn teilt das
// Ereignis mit der Anfrage. Siehe docs/bot/rate-limits.md, „Zählen“.
export function zaehleAnfragen(rest: REST, zaehlung: Pick<Zaehlung, 'antwort'>): void {
  rest.on(RESTEvents.Response, (anfrage, antwort) => {
    try {
      zaehlung.antwort({ methode: anfrage.method, pfad: anfrage.path, status: antwort.status, kopf: (name) => antwort.headers.get(name) });
    } catch (fehler) {
      // Das Zählen darf keine Anfrage stören.
      console.error(`Rate-Limit: nicht gezählt: ${text(fehler)}`);
    }
  });
}

// Der Stand für die Debug-Seite mit den Shards dieses Prozesses; ohne
// ShardingManager ist es Shard 0.
export function debugStand(client: Client, zaehlung: Pick<Zaehlung, 'stand'>): Debug {
  return zaehlung.stand(client.shard?.ids ?? [0]);
}
