import type { Pool } from 'pg';
import type { Kontext } from './discord/kontext.js';
import type { Modul } from './kern/modul.js';
import type { Zaehlung } from './kern/zaehlung.js';
import { begruessungsModul } from './module/begruessung/modul.js';
import { sprachraeumeModul } from './module/sprachraeume/modul.js';

// Was die Module zum Bauen brauchen. Die Caches kommen noch von
// bot/src/index.ts, weil die Ereignisse dort hängen.
export interface ModulUmgebung {
  db: Pool;
  zaehlung: Pick<Zaehlung, 'griff'>;
  einstellungen: { delete(server: string): unknown };
  sprachraeume: { delete(server: string): unknown };
}

// Alle Module des Bots, in der Reihenfolge der Tabs im Dashboard.
// Siehe docs/entwicklung/struktur.md, „Ein Modul“.
export function alleModule(u: ModulUmgebung): Modul<Kontext>[] {
  return [
    begruessungsModul({ db: u.db, einstellungen: u.einstellungen, zaehlung: u.zaehlung }),
    sprachraeumeModul({ db: u.db, sprachraeume: u.sprachraeume }),
  ];
}
