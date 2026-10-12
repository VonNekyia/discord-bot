import type { Kontext } from '../../discord/kontext.js';
import type { Modul } from '../../kern/modul.js';
import { sprachraeumeBereich, type SprachraeumeOptionen } from './seiten.js';

// Das Modul Sprachräume: die Einstellungen und die Räume je Server, die
// Seite Sprachräume. Siehe docs/entwicklung/struktur.md, „Ein Modul“.
export function sprachraeumeModul(o: SprachraeumeOptionen & { sprachraeume: { delete(server: string): unknown } }): Modul<Kontext> {
  return {
    name: 'sprachraeume',
    tabellen: ['sprachraeume', 'raeume'],
    vergiss: (server) => void o.sprachraeume.delete(server),
    bereich: sprachraeumeBereich(o),
  };
}
