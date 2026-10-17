import type { Pool } from 'pg';
import { BausteinFehler, type Baustein, type Bereich, type Option, type Satz } from '../../kern/baukasten.js';
import type { Kontext } from '../../discord/kontext.js';
import type { Server } from '../../discord/server.js';
import { laengste, liesStrafen, pruefe, speichereStrafen } from './strafen.js';

export interface StrafenSeite {
  db: Pick<Pool, 'query'>;
  // Die Rollen für die Auswahl, die höchste zuerst; im Bot `rollenAuf`.
  rollen(server: Server): { id: string; name: string }[];
  // Darf der Bot bannen und kicken? Im Bot aus `botAuf`.
  rechte(server: Server): { bannen: boolean; kicken: boolean };
  // Der Cache der Einstellungen; wer schreibt, löscht dort den Server.
  einstellungen?: { delete(server: string): unknown };
}

// Die Sätze zu den Codes dieser Seite. Siehe docs/schnittstelle/strafen.md.
const saetze: Record<string, Satz> = {
  zu_viele_gruende: { titel: 'Das sind zu viele Gründe.', text: 'Discord zeigt höchstens 24 und „Eigener Grund …“. Entferne einen.' },
  grund_leer: { titel: 'Der Grund ist leer.', text: 'Schreib einen Grund oder entferne ihn.' },
  grund_zu_lang: { titel: 'Der Grund ist zu lang.', text: 'Kürz ihn auf 100 Zeichen.' },
  grund_reserviert: { titel: '„custom“ steht schon für den eigenen Grund.', text: 'Nimm ein anderes Wort.' },
  grund_doppelt: { titel: 'Diesen Grund gibt es schon.', text: 'Entferne einen der beiden.' },
  zu_viele_limits: { titel: 'Das sind zu viele Rollen.', text: 'Höchstens 25. Entferne eine.' },
  rolle_fehlt: { titel: 'Hier ist noch keine Rolle gewählt.', text: 'Wähl eine oder entferne den Eintrag.' },
  rolle_unbekannt: { titel: 'Diese Rolle gibt es nicht mehr.', text: 'Wähl eine andere oder entferne den Eintrag.' },
  rolle_doppelt: { titel: 'Diese Rolle steht schon in der Liste.', text: 'Wähl eine andere.' },
  limit_ungueltig: { titel: 'Das Limit ist keine ganze Zahl von 0 bis 100.', text: 'Gib eine Zahl von 0 bis 100 ein; 0 heisst: nie.' },
  dm_zu_lang: { titel: 'Die Nachricht ist zu lang.', text: 'Kürz sie, mit 100 Zeichen für {server} und 400 für {grund} gerechnet.' },
  entbannung_zu_lang: { titel: 'Der Text zur Entbannung ist zu lang.', text: 'Kürz ihn auf 500 Zeichen.' },
  verwarnung_tage_ungueltig: { titel: 'Die Frist ist keine ganze Zahl von 30 bis 730.', text: 'Gib eine Zahl von 30 bis 730 Tagen ein.' },
  dm_ohne_text: { titel: 'Ohne Text kann kitty keine DM schicken.', text: 'Schreib einen Text oder nimm den Haken bei „DM beim Bann“ weg.' },
};

function bausteine(rollen: Option[], rechte: { bannen: boolean; kicken: boolean }): Baustein[] {
  const fehlt = [rechte.bannen ? [] : ['„Mitglieder bannen“'], rechte.kicken ? [] : ['„Mitglieder kicken“']].flat();
  const oben: Baustein[] =
    fehlt.length === 0
      ? []
      : [
          {
            art: 'hinweis',
            id: 'rechte',
            ton: 'warn',
            // Siehe docs/benutzung/managed-commands.md, „Rechte und Intent“.
            satz: { titel: 'kitty fehlen Rechte auf dem Server.', text: `Ohne ${fehlt.join(' und ')} gehen die Befehle nicht. Gib kitty die Rechte und lade die Seite neu.` },
          },
        ];
  return [
    ...oben,
    {
      art: 'liste',
      id: 'gruende',
      eintrag: 'Grund',
      hoechstens: 24,
      hinzufuegen: 'Grund hinzufügen',
      entfernen: 'Entfernen',
      voll: 'Mehr als 24 Gründe zeigt Discord nicht.',
      leer: { titel: 'Noch kein Grund.', text: 'Füg Gründe hinzu, etwa „Spam“. Sie stehen bei /ban, /kick und /warn zur Wahl.' },
      neu: { text: '' },
      bausteine: [{ art: 'text', id: 'text', titel: 'Grund', mehrzeilig: false, grenze: 100, platzhalter: {}, pflicht: 'grund_leer' }],
    },
    {
      art: 'liste',
      id: 'limits',
      eintrag: 'Rolle',
      kopf: 'rolle',
      hoechstens: 25,
      hinzufuegen: 'Rolle hinzufügen',
      entfernen: 'Entfernen',
      voll: 'Mehr als 25 Rollen gehen nicht.',
      leer: { titel: 'Noch keine Rolle.', text: 'Ohne Rolle nutzen nur Eigentümer und Administratoren die Befehle.' },
      neu: { rolle: null, bans: 1, kicks: 3 },
      bausteine: [
        {
          art: 'auswahl',
          id: 'rolle',
          titel: 'Rolle',
          leer: 'Bitte wählen',
          optionen: rollen,
          unbekannt: 'rolle_unbekannt',
          pflicht: 'rolle_fehlt',
          einmalig: 'rolle_doppelt',
          vergeben: 'schon gewählt',
        },
        { art: 'zahl', id: 'bans', titel: 'Bans je 7 Tage', min: 0, max: 100, ungueltig: 'limit_ungueltig' },
        { art: 'zahl', id: 'kicks', titel: 'Kicks je 7 Tage', min: 0, max: 100, ungueltig: 'limit_ungueltig' },
      ],
    },
    {
      art: 'schalter',
      id: 'dm',
      titel: 'DM beim Bann',
      hilfe: 'Vor dem Bann schickt kitty dem Mitglied die Nachricht unten. Bei /warn schickt kitty den Grund immer.',
    },
    {
      art: 'text',
      id: 'dmText',
      titel: 'Nachricht beim Bann',
      hilfe: '{server} wird zum Namen des Servers, {grund} zum Grund.',
      mehrzeilig: true,
      grenze: 1400,
      platzhalter: laengste,
      rechnung: 'mit 100 Zeichen für {server} und 400 für {grund} gerechnet',
    },
    {
      art: 'text',
      id: 'entbannung',
      titel: 'So wird man entbannt',
      hilfe: 'Steht unter der Nachricht, etwa wo man einen Antrag stellt.',
      mehrzeilig: true,
      grenze: 500,
      platzhalter: {},
    },
    {
      art: 'zahl',
      id: 'verwarnungTage',
      titel: 'Verwarnungen speichern, Tage',
      hilfe: 'So lange zählt eine Verwarnung mit; danach löscht kitty sie.',
      min: 30,
      max: 730,
      ungueltig: 'verwarnung_tage_ungueltig',
    },
  ];
}

// Die Managed Commands als eine Seite des Dashboards.
// Siehe docs/schnittstelle/strafen.md.
export function strafenBereich(o: StrafenSeite): Bereich<Kontext> {
  const optionen = (server: Server): Option[] => o.rollen(server).map((r) => ({ id: r.id, name: r.name, gruppe: null, merkmale: [], gesperrt: null }));

  return {
    seiten: { strafen: {} },

    async zeige({ server }) {
      const rollen = optionen(server);
      const wert = await liesStrafen(o.db, server.id);
      // Was gespeichert heute nicht mehr besteht, etwa eine gelöschte Rolle.
      const geprueft = pruefe(wert, new Set(rollen.map((r) => r.id)));
      return [
        {
          id: 'strafen',
          titel: 'Managed Commands',
          bausteine: bausteine(rollen, o.rechte(server)),
          daneben: [],
          wert,
          saetze,
          fund: 'code' in geprueft ? geprueft : null,
        },
      ];
    },

    async speichere({ server }, seite, eingabe) {
      if (seite !== 'strafen') throw new BausteinFehler(404, 'nicht_gefunden');
      const ergebnis = pruefe(eingabe, new Set(o.rollen(server).map((r) => r.id)));
      if ('code' in ergebnis) throw new BausteinFehler(400, ergebnis.code, ergebnis.feld);
      const s = ergebnis.strafen;
      await speichereStrafen(o.db, server.id, s);
      o.einstellungen?.delete(server.id);
      const n = s.limits.length;
      return {
        wert: s,
        meldung: {
          titel: 'Gespeichert.',
          text: n === 0 ? 'Nur Eigentümer und Administratoren nutzen die Befehle.' : `Mitglieder mit ${n === 1 ? 'einer Rolle' : `${n} Rollen`} aus der Liste nutzen die Befehle.`,
        },
      };
    },
  };
}
