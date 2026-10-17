import type { Pool } from 'pg';
import { banne, botAuf, kicke, rollenAuf, schreibe, zielAuf } from './discord/moderation.js';
import type { DiscordModul } from './discord/modul.js';
import type { Zaehlung } from './kern/zaehlung.js';
import { befehleModul } from './module/befehle/modul.js';
import { begruessungsModul, type BegruessungUmgebung } from './module/begruessung/modul.js';
import { sprachraeumeModul, type SprachraeumeUmgebung } from './module/sprachraeume/modul.js';
import { strafenModul, type StrafenUmgebung } from './module/strafen/modul.js';

// Was die Module zum Bauen brauchen. Die Caches bauen die Module selbst;
// nur Tests geben eigene.
export interface ModulUmgebung {
  db: Pool;
  zaehlung: Pick<Zaehlung, 'griff'>;
  // Der Textkanal über die IDs; im Bot `textkanalAuf` aus der Discord-Schicht.
  kanal: BegruessungUmgebung['kanal'];
  einstellungen?: BegruessungUmgebung['einstellungen'];
  sprachraeume?: SprachraeumeUmgebung['sprachraeume'];
  // Bann, Kick, DM, Ziele und Rollen; ohne Angabe aus bot/src/discord/moderation.ts.
  moderation?: StrafenUmgebung['werkzeuge'];
  strafen?: StrafenUmgebung['einstellungen'];
}

const moderation: StrafenUmgebung['werkzeuge'] = { zielAuf, botAuf, banne, kicke, schreibe, rollen: rollenAuf };

// Alle Module des Bots. Ihre Seiten kommen in der Reihenfolge der Liste als
// Tabs ins Dashboard. Siehe docs/entwicklung/struktur.md, „Ein Modul“.
export function alleModule(u: ModulUmgebung): DiscordModul[] {
  return [
    befehleModul({ db: u.db }),
    begruessungsModul({ db: u.db, zaehlung: u.zaehlung, kanal: u.kanal, ...(u.einstellungen ? { einstellungen: u.einstellungen } : {}) }),
    sprachraeumeModul({ db: u.db, ...(u.sprachraeume ? { sprachraeume: u.sprachraeume } : {}) }),
    strafenModul({ db: u.db, werkzeuge: u.moderation ?? moderation, ...(u.strafen ? { einstellungen: u.strafen } : {}) }),
  ];
}
