import type { Bereich } from './baukasten.js';

// Was ein Modul dem Bot gibt. `K` ist der Kontext seiner Seiten; den Typ
// kennt erst die Discord-Schicht. Der Vertrag wächst, wenn ein Modul mehr
// braucht. Siehe docs/entwicklung/struktur.md, „Ein Modul“.
export interface Modul<K> {
  // Für Fehler beim Start.
  name: string;
  // Tabellen mit Daten je Server, jede mit der Spalte `server`. Verlässt der
  // Bot einen Server, löscht `Aufraeumen` ihre Zeilen.
  tabellen?: readonly string[];
  // Vergisst, was das Modul im Speicher zu `server` hält, etwa im Cache.
  vergiss?(server: string): void;
  // Seine Seiten im Dashboard.
  bereich?: Bereich<K>;
}
