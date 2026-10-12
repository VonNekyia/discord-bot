import type { Pool } from 'pg';
import { BausteinFehler, type Baustein, type Bereich, type Option, type Satz } from '../../kern/baukasten.js';
import type { Kontext } from '../../discord/kontext.js';
import { raeumeVon } from './raeume.js';
import { liesSprachraeume, liste, pruefe, speichereSprachraeume, type Liste } from './sprachraeume.js';

export interface SprachraeumeOptionen {
  db: Pool;
  // Der Cache der Sprachräume; wer schreibt, löscht dort den Server.
  sprachraeume?: { delete(server: string): unknown };
}

const fehltRecht = 'kitty fehlt ein Recht';

// Die Sätze zu den Codes dieser Seite. Siehe docs/schnittstelle/sprachraeume.md.
const saetze: Record<string, Satz> = {
  zu_viele_erzeuger: { titel: 'Das sind zu viele Erzeuger.', text: 'Ein Server hat höchstens 10. Entferne einen.' },
  erzeuger_fehlt: { titel: 'Hier ist noch kein Sprachkanal gewählt.', text: 'Wähl einen oder entferne den Erzeuger.' },
  erzeuger_unbekannt: { titel: 'Diesen Sprachkanal gibt es nicht mehr.', text: 'Wähl einen anderen oder entferne den Erzeuger.' },
  erzeuger_ohne_recht: {
    titel: 'In diesem Sprachkanal fehlt kitty ein Recht.',
    text: 'kitty braucht dort „Kanal ansehen“, „Verbinden“ und „Mitglieder verschieben“. Wähl einen anderen oder gib kitty die Rechte.',
  },
  erzeuger_doppelt: { titel: 'Diesen Sprachkanal hast du schon als Erzeuger.', text: 'Wähl einen anderen.' },
  kategorie_unbekannt: { titel: 'Diese Kategorie gibt es nicht mehr.', text: 'Wähl eine andere.' },
  kategorie_ohne_recht: { titel: 'Dort darf kitty keine Räume anlegen.', text: 'Wähl eine andere Kategorie oder gib kitty dort die Rechte.' },
  name_leer: { titel: 'Der Name ist leer.', text: 'Schreib eine Vorlage, etwa „{name}s Raum“.' },
  name_zu_lang: { titel: 'Der Name ist zu lang.', text: 'Kürz ihn, mit 32 Zeichen für {name} gerechnet.' },
  limit_ungueltig: { titel: 'Das Limit ist keine ganze Zahl von 0 bis 99.', text: 'Gib eine Zahl von 0 bis 99 ein; 0 heisst unbegrenzt.' },
  an_ohne_erzeuger: { titel: 'Ohne Erzeuger entsteht kein Raum.', text: 'Füg einen Erzeuger hinzu oder nimm den Haken bei „Aktiv“ weg.' },
};

// Die Bausteine der Seite, oben nach unten. Ohne die Rechte auf dem Server
// geht kein Erzeuger; dann steht oben ein Hinweis.
// Siehe docs/schnittstelle/sprachraeume.md, „Bausteine“.
function bausteine(l: Liste): Baustein[] {
  const sprachkanaele = l.sprachkanaele.map(
    (k): Option => ({
      id: k.id,
      name: k.name,
      gruppe: k.kategorie,
      merkmale: [],
      gesperrt: k.bereit ? null : { grund: fehltRecht, code: 'erzeuger_ohne_recht' },
    }),
  );
  const kategorien = l.kategorien.map(
    (k): Option => ({
      id: k.id,
      name: k.name,
      gruppe: null,
      merkmale: [],
      gesperrt: k.bereit ? null : { grund: fehltRecht, code: 'kategorie_ohne_recht' },
    }),
  );
  const oben: Baustein[] = l.ohneKategorie.bereit
    ? []
    : [
        {
          art: 'hinweis',
          id: 'rechte',
          ton: 'warn',
          // Die sieben Rechte: siehe docs/benutzung/sprachraeume.md, „Rechte und Intent“.
          satz: {
            titel: 'kitty fehlen Rechte auf dem Server.',
            text: 'Ohne „Kanäle verwalten“, „Rollen verwalten“, „Mitglieder verschieben“, „Kanal ansehen“, „Verbinden“, „Nachrichten senden“ und „Nachrichtenverlauf anzeigen“ auf dem ganzen Server entsteht kein Sprachraum. Gib kitty diese Rechte und lade die Seite neu.',
          },
        },
      ];
  return [
    ...oben,
    {
      art: 'schalter',
      id: 'an',
      titel: 'Aktiv',
      hilfe:
        'Wer einen Erzeuger betritt, bekommt einen eigenen Sprachraum. Jeder Raum bekommt sein Menü mit den Knöpfen im eigenen Textchat. Was du hier änderst, gilt für Räume, die danach entstehen.',
    },
    {
      art: 'liste',
      id: 'erzeuger',
      titel: 'Erzeuger',
      eintrag: 'Erzeuger',
      kopf: 'kanal',
      hoechstens: 10,
      hinzufuegen: 'Erzeuger hinzufügen',
      entfernen: 'Entfernen',
      voll: 'Mehr als 10 Erzeuger hat ein Server nicht.',
      leer: { titel: 'Noch kein Erzeuger.', text: 'Füg einen Sprachkanal hinzu, etwa „➕ Talk“. Wer ihn betritt, bekommt einen Raum.' },
      neu: { kanal: null, kategorie: null, name: '{name}s Raum', limit: 0 },
      bausteine: [
        {
          art: 'auswahl',
          id: 'kanal',
          titel: 'Erzeuger',
          leer: 'Bitte wählen',
          optionen: sprachkanaele,
          unbekannt: 'erzeuger_unbekannt',
          pflicht: 'erzeuger_fehlt',
          einmalig: 'erzeuger_doppelt',
        },
        {
          art: 'auswahl',
          id: 'kategorie',
          titel: 'Kategorie',
          hilfe: 'Ohne Wahl entstehen die Räume in der Kategorie des Erzeugers.',
          leer: 'Kategorie des Erzeugers',
          optionen: kategorien,
          unbekannt: 'kategorie_unbekannt',
        },
        {
          art: 'text',
          id: 'name',
          titel: 'Name',
          hilfe: '{name} wird zum Namen des Besitzers.',
          mehrzeilig: false,
          grenze: 100,
          platzhalter: { name: 32 },
          rechnung: 'mit 32 Zeichen für {name} gerechnet',
          pflicht: 'name_leer',
        },
        { art: 'zahl', id: 'limit', titel: 'Limit', hilfe: 'So viele dürfen in den Raum; 0 heisst unbegrenzt.', min: 0, max: 99, ungueltig: 'limit_ungueltig' },
      ],
    },
  ];
}

// Die Sprachräume als eine Seite des Dashboards.
// Siehe docs/schnittstelle/sprachraeume.md.
export function sprachraeumeBereich(o: SprachraeumeOptionen): Bereich<Kontext> {
  const listeVon = async (server: Kontext['server']) => liste(server, await raeumeVon(o.db, server.id));

  return {
    seiten: { sprachraeume: {} },

    async zeige({ server }) {
      const [l, wert] = await Promise.all([listeVon(server), liesSprachraeume(o.db, server.id)]);
      // Was der gespeicherte Stand heute nicht mehr besteht, steht beim Laden am Feld.
      const geprueft = pruefe(wert, l);
      return [
        {
          id: 'sprachraeume',
          titel: 'Sprachräume',
          bausteine: bausteine(l),
          daneben: [],
          wert,
          saetze,
          fund: 'code' in geprueft ? geprueft : null,
        },
      ];
    },

    async speichere({ server }, seite, eingabe) {
      if (seite !== 'sprachraeume') throw new BausteinFehler(404, 'nicht_gefunden');
      const ergebnis = pruefe(eingabe, await listeVon(server));
      if ('code' in ergebnis) throw new BausteinFehler(400, ergebnis.code, ergebnis.feld);
      const s = ergebnis.sprachraeume;
      await speichereSprachraeume(o.db, server.id, s);
      o.sprachraeume?.delete(server.id);
      const anzahl = s.erzeuger.length;
      return {
        wert: s,
        meldung: {
          titel: 'Gespeichert.',
          text: s.an
            ? `Wer ${anzahl === 1 ? 'den Erzeuger' : `einen der ${anzahl} Erzeuger`} betritt, bekommt einen Raum.`
            : 'Solange „Aktiv“ aus ist, entstehen keine neuen Räume.',
        },
      };
    },
  };
}
