import type { Pool } from 'pg';
import type { DiscordModul } from '../../discord/modul.js';
import { ladeCache } from '../../kern/cache.js';
import { text } from '../../kern/fehler.js';
import { Knoepfe } from './knoepfe.js';
import { praefix } from './menue.js';
import { Raeume, type RaumKontext } from './raeume.js';
import { sprachraeumeBereich } from './seiten.js';
import { liesSprachraeume } from './sprachraeume.js';

export interface SprachraeumeUmgebung {
  db: Pool;
  // Der Cache der Sprachräume; ohne Angabe ein eigener. Tests geben einen.
  sprachraeume?: RaumKontext['einstellungen'] & { delete(server: string): unknown };
}

// Das Modul Sprachräume: die Einstellungen und die Räume je Server, die
// Seite Sprachräume, das Menü und die Räume bei jedem Wechsel eines
// Sprachkanals. Siehe docs/entwicklung/struktur.md, „Ein Modul“.
export function sprachraeumeModul(u: SprachraeumeUmgebung): DiscordModul {
  // Gelesen bei jedem Betreten eines Sprachkanals; wer sie ändert, löscht den
  // Server hier. Siehe docs/bot/cache.md, „Wann cachen“.
  const sprachraeume = u.sprachraeume ?? ladeCache((server: string) => liesSprachraeume(u.db, server));
  const raeume = new Raeume({ db: u.db, einstellungen: sprachraeume });
  const knoepfe = new Knoepfe({ db: u.db });
  return {
    name: 'sprachraeume',
    tabellen: ['sprachraeume', 'raeume'],
    vergiss: (server) => void sprachraeume.delete(server),
    bereich: sprachraeumeBereich({ db: u.db, sprachraeume }),
    // Siehe docs/bot/sprachraeume-menue.md, „Knöpfe“.
    knoepfe: { praefix, bediene: (druck) => knoepfe.bediene(druck) },
    schalter: { titel: 'Sprachräume', hilfe: 'Wer einen Erzeuger betritt, bekommt einen eigenen Sprachraum mit Menü im Textchat.' },
    // Neue Räume nur, wenn das Modul an ist. Siehe docs/benutzung/sprachraeume.md.
    ereignisse: {
      stimme: (server, nutzer, vorher, nachher) => raeume.kommt(server, nutzer, vorher, nachher),
    },
    // Leere Räume gehen auch, wenn es aus ist. Siehe docs/schnittstelle/module.md, „Ein Modul ist aus“.
    aufraeumen: {
      // Räume, die es nicht mehr gibt, vergessen; leere löschen.
      // Siehe docs/bot/sprachraeume-bau.md, „Abgleich beim Start“.
      bereit: (server) => raeume.gleicheAb(server).catch((e: unknown) => console.error(`Abgleich der Räume fehlgeschlagen: ${text(e)}`)),
      stimme: (server, _nutzer, vorher, nachher) => raeume.geht(server, vorher, nachher),
      kanalWeg: (kanal) => raeume.geloescht(kanal).catch((e: unknown) => console.error(`Sprachraum: nicht vergessen: ${text(e)}`)),
    },
  };
}
