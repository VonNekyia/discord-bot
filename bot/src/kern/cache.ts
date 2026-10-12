import { LRUCache } from 'lru-cache';

// Ein Cache für Daten, die oft gelesen und selten geschrieben werden. `fetch`
// lädt einen fehlenden Wert mit `laden`; gleichzeitige Anfragen nach demselben
// Schlüssel laden nur einmal. Wer den Wert in der Datenbank ändert, ruft danach
// `delete(schluessel)`. Siehe docs/bot/cache.md.
export function ladeCache<K extends {}, V extends {}>(
  laden: (schluessel: K) => Promise<V>,
  { max = 10_000, ttl = 10 * 60_000 } = {},
): LRUCache<K, V> {
  return new LRUCache<K, V>({ max, ttl, fetchMethod: (schluessel) => laden(schluessel) });
}
