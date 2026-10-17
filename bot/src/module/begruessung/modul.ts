import type { Pool } from 'pg';
import type { DiscordModul } from '../../discord/modul.js';
import { ladeCache } from '../../kern/cache.js';
import type { Zaehlung } from '../../kern/zaehlung.js';
import { lese } from './begruessung.js';
import { begruesse, erstelleBremse, type SendeKontext } from './senden.js';
import { begruessungsBereich } from './seiten.js';

export interface BegruessungUmgebung {
  db: Pool;
  // Zählt, wie oft Bremse und Grenze der Testnachricht greifen.
  zaehlung: Pick<Zaehlung, 'griff'>;
  // Der Textkanal über die IDs; im Bot `textkanalAuf` aus der Discord-Schicht.
  kanal: SendeKontext['kanal'];
  // Der Cache der Einstellungen; ohne Angabe ein eigener. Tests geben einen.
  einstellungen?: SendeKontext['einstellungen'] & { delete(server: string): unknown };
}

// Das Modul Begrüssung: Einstellungen und Bilder je Server, die Seiten
// Beitritt und Abschied, das Senden bei Beitritt und Abschied.
// Siehe docs/entwicklung/struktur.md, „Ein Modul“.
export function begruessungsModul(u: BegruessungUmgebung): DiscordModul {
  // Die Einstellungen liest jeder Beitritt und Abschied; wer sie ändert, löscht
  // den Server hier. Siehe docs/bot/cache.md, „Wann cachen“.
  const einstellungen = u.einstellungen ?? ladeCache((server: string) => lese(u.db, server));
  // Eine Bremse für alle Server, im Speicher. Siehe docs/benutzung/begruessung.md, „Bremse“.
  const senden: SendeKontext = { db: u.db, einstellungen, kanal: u.kanal, bremse: erstelleBremse({ einstellungen, kanal: u.kanal }), zaehlung: u.zaehlung };
  return {
    name: 'begruessung',
    tabellen: ['begruessungen', 'bilder'],
    vergiss: (server) => void einstellungen.delete(server),
    bereich: begruessungsBereich({ db: u.db, einstellungen, zaehlung: u.zaehlung }),
    schalter: { titel: 'Begrüssung', hilfe: 'Eine Nachricht, auf Wunsch mit Banner, wenn jemand dem Server beitritt oder ihn verlässt.' },
    ereignisse: {
      beitritt: (mitglied) => begruesse(mitglied, 'beitritt', senden),
      abschied: (mitglied) => begruesse(mitglied, 'abschied', senden),
    },
  };
}
