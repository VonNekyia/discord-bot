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
  // Löscht, was über seiner Frist ist. bot/src/index.ts ruft es beim Start
  // und dann stündlich, auch ohne API und auch, wo das Modul aus ist.
  // Siehe docs/entwicklung/struktur.md, „Ein Modul“.
  raeumeAuf?(): Promise<void>;
  // Seine Seiten im Dashboard.
  bereich?: Bereich<K>;
  // Sein Schalter auf dem Board; ohne ihn ist das Modul immer an. Die ID
  // des Schalters ist `name`. Siehe docs/schnittstelle/module.md.
  schalter?: Schalter;
}

// Wie ein Modul auf dem Board steht.
export interface Schalter {
  titel: string;
  // Was das Modul tut, ein Satz.
  hilfe: string;
  // Nur an, wenn es auf dem Server freigeschaltet ist; ohne gespeicherten
  // Stand aus. Freie Module sind ohne gespeicherten Stand an.
  bezahlt?: boolean;
}
