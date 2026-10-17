import type { Pool } from 'pg';
import type { DiscordModul } from '../../discord/modul.js';
import { ladeCache } from '../../kern/cache.js';
import { praefix, raeumeStrafenAuf, Strafbefehle, type StrafenKontext, type Werkzeuge } from './befehle.js';
import { strafenBereich, type StrafenSeite } from './seiten.js';
import { liesStrafen } from './strafen.js';

export interface StrafenUmgebung {
  db: Pool;
  // Was die Befehle und die Seite von Discord brauchen; im Bot aus der Discord-Schicht.
  werkzeuge: Werkzeuge & Pick<StrafenSeite, 'rollen'>;
  // Der Cache der Einstellungen; ohne Angabe ein eigener. Tests geben einen.
  einstellungen?: StrafenKontext['einstellungen'] & { delete(server: string): unknown };
  uhr?: () => number;
}

// Das Modul Managed Commands: /ban, /kick und /warn, die Seite „Managed
// Commands“, die Formulare für den eigenen Grund. Bezahlt, siehe
// docs/entscheidungen/0020-bezahlte-module.md. Siehe docs/benutzung/managed-commands.md.
export function strafenModul(u: StrafenUmgebung): DiscordModul {
  // Gelesen bei jedem Befehl und jedem Autocomplete; wer schreibt, löscht
  // den Server hier. Siehe docs/bot/cache.md, „Wann cachen“.
  const einstellungen = u.einstellungen ?? ladeCache((server: string) => liesStrafen(u.db, server));
  const uhr = u.uhr ?? (() => Date.now());
  const befehle = new Strafbefehle({ db: u.db, einstellungen, w: u.werkzeuge, uhr });
  return {
    name: 'strafen',
    tabellen: ['strafen', 'strafaktionen', 'verwarnungen'],
    vergiss: (server) => void einstellungen.delete(server),
    schalter: {
      titel: 'Managed Commands',
      hilfe: '/ban, /kick und /warn mit Gründen und Limits je Rolle. 4,99 € einmalig für einen Server, oder im Abo „Alles“ für 19,99 € im Monat.',
      bezahlt: true,
    },
    bereich: strafenBereich({
      db: u.db,
      rollen: (server) => u.werkzeuge.rollen(server),
      rechte: (server) => u.werkzeuge.botAuf(server) ?? { bannen: false, kicken: false },
      einstellungen,
    }),
    befehle: befehle.befehle(),
    knoepfe: { praefix, bediene: (druck) => befehle.formular(druck) },
    // Alte Bans, Kicks und Verwarnungen, auch wo das Modul aus ist.
    // Siehe docs/bot/datenschutz.md, „Was der Bot speichert“.
    raeumeAuf: async () => void (await raeumeStrafenAuf(u.db, uhr())),
  };
}
