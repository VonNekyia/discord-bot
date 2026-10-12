import type { Kontext } from '../../discord/kontext.js';
import type { Modul } from '../../kern/modul.js';
import { begruessungsBereich, type BegruessungOptionen } from './seiten.js';

// Das Modul Begrüssung: Einstellungen und Bilder je Server, die Seiten
// Beitritt und Abschied. Siehe docs/entwicklung/struktur.md, „Ein Modul“.
export function begruessungsModul(o: BegruessungOptionen & { einstellungen: { delete(server: string): unknown } }): Modul<Kontext> {
  return {
    name: 'begruessung',
    tabellen: ['begruessungen', 'bilder'],
    vergiss: (server) => void o.einstellungen.delete(server),
    bereich: begruessungsBereich(o),
  };
}
