import type { Pool } from 'pg';
import { BausteinFehler, type Baustein, type Bereich, type Option, type Satz, type Seite } from '../../kern/baukasten.js';
import { Grenze } from '../../kern/grenze.js';
import type { Zaehlung } from '../../kern/zaehlung.js';
import { kanaele, type Kanal } from '../../discord/kanaele.js';
import { alsMitglied, textkanal } from '../../discord/nachrichten.js';
import type { Kontext } from '../../discord/kontext.js';
import { BildFehler, bereiteVor, breite, hoehe } from './banner.js';
import { laengste, lese, loescheBild, pruefe, speichere, speichereBild, type Art, type Einstellung } from './begruessung.js';
import { banner, sendeTest } from './senden.js';

export interface BegruessungOptionen {
  db: Pool;
  // Der Cache der Einstellungen; wer schreibt, löscht dort den Server.
  // Siehe docs/bot/cache.md, „So geht es“.
  einstellungen?: { delete(server: string): unknown };
  // Lädt Avatare für Vorschau und Testnachricht; in Tests ein Ersatz.
  avatar?: (url: string) => Promise<Buffer | undefined>;
  // Die Uhr der Grenze je Server, in ms; in Tests eine falsche.
  uhr?: () => number;
  // Zählt, wie oft die Grenze je Server greift. Siehe docs/bot/rate-limits.md, „Eigene Grenzen“.
  zaehlung?: Pick<Zaehlung, 'griff'>;
}

const titel: Record<Art, string> = { beitritt: 'Beitritt', abschied: 'Abschied' };
const bildtypen = ['image/png', 'image/jpeg', 'image/webp'];
const bildGroesse = 4 * 1024 * 1024;
const rechnung = 'mit den längsten Namen gerechnet';

// Die Sätze zu den Codes dieser Seiten. Siehe docs/schnittstelle/begruessung.md.
const saetze: Record<string, Satz> = {
  kanal_unbekannt: {
    titel: 'Diesen Kanal gibt es nicht mehr, oder kitty darf dort nicht schreiben.',
    text: 'Wähl einen neuen Kanal.',
  },
  text_zu_lang: { titel: 'Der Text ist zu lang.', text: `Kürz ihn, ${rechnung}.` },
  bannertext_zu_lang: { titel: 'Der Text auf dem Banner ist zu lang.', text: `Kürz ihn, ${rechnung}.` },
  banner_ohne_bild: { titel: 'Für das Banner fehlt ein Bild.', text: 'Lade zuerst ein Bild hoch.' },
  banner_ohne_recht: {
    titel: 'In diesem Kanal darf kitty keine Dateien anhängen.',
    text: 'Wähl einen anderen Kanal oder schalte das Banner aus.',
  },
  an_ohne_kanal: { titel: 'Ohne Kanal kann kitty nichts schicken.', text: 'Wähl einen Kanal oder nimm den Haken bei „Aktiv“ weg.' },
  an_ohne_inhalt: { titel: 'Es gibt nichts zu schicken.', text: 'Schreib einen Text oder schalte das Banner ein.' },
  bildtyp: { titel: 'Das ist kein PNG, JPEG oder WebP.', text: 'Wähl ein anderes Bild.' },
  bild_zu_gross: { titel: 'Das Bild ist zu gross.', text: 'Erlaubt sind 4 MiB und 4096 px je Seite.' },
  bild_zu_klein: { titel: 'Das Bild ist zu klein.', text: 'Es braucht mindestens 200 px je Seite.' },
  bild_unlesbar: { titel: 'Das Bild lässt sich nicht lesen.', text: 'Speicher es neu oder wähl ein anderes.' },
  test_ohne_kanal: { titel: 'Im gespeicherten Stand ist kein Kanal gewählt.', text: 'Wähl einen Kanal und speicher, dann geht die Testnachricht.' },
  test_ohne_inhalt: {
    titel: 'Im gespeicherten Stand gibt es nichts zu senden.',
    text: 'Schreib einen Text oder schalte das Banner ein und speicher.',
  },
};

// Platzhalter mit ihrem längsten Wert, ohne Klammern, wie der Baukasten sie nimmt.
const platzhalter = (wo: keyof typeof laengste) =>
  Object.fromEntries(Object.entries(laengste[wo]).map(([name, wert]) => [name.slice(1, -1), wert]));

const option = (k: Kanal): Option => ({
  id: k.id,
  name: `#${k.name}`,
  gruppe: k.kategorie,
  merkmale: k.banner ? ['banner'] : [],
  gesperrt: null,
});

// Die Bausteine einer Seite, oben nach unten, und daneben die Vorschau.
// Siehe docs/schnittstelle/begruessung.md, „Bausteine“.
function bausteine(liste: Kanal[]): { bausteine: Baustein[]; daneben: Baustein[] } {
  return {
    bausteine: [
      { art: 'schalter', id: 'an', titel: 'Aktiv' },
      { art: 'auswahl', id: 'kanal', titel: 'Kanal', leer: 'Kein Kanal', optionen: liste.map(option), unbekannt: 'kanal_unbekannt' },
      {
        art: 'text',
        id: 'text',
        titel: 'Text',
        hilfe:
          'Platzhalter: {nutzer} erwähnt das Mitglied, {name} ist sein Name, {server} der Name des Servers, {anzahl} die Zahl der Mitglieder.',
        mehrzeilig: true,
        grenze: 2000,
        platzhalter: platzhalter('text'),
        rechnung,
      },
      {
        art: 'schalter',
        id: 'banner',
        titel: 'Banner',
        braucht: [
          { feld: 'bild', sonst: 'Für das Banner lädst du zuerst unten ein Bild hoch.' },
          { feld: 'kanal', sonst: 'Für das Banner wählst du zuerst einen Kanal.' },
          {
            feld: 'kanal',
            merkmal: 'banner',
            sonst: 'In diesem Kanal darf kitty keine Dateien anhängen. Gib kitty dort das Recht „Dateien anhängen“ oder wähl einen anderen Kanal.',
          },
        ],
      },
      {
        art: 'bild',
        id: 'bild',
        titel: 'Bild',
        hilfe: 'PNG, JPEG oder WebP, bis 4 MiB, am besten 1100 × 440 px.',
        typen: bildtypen,
        groesse: bildGroesse,
        pixel: { min: 200, max: 4096 },
        entfernen: 'Bild entfernen',
      },
      {
        art: 'text',
        id: 'bannerText',
        titel: 'Text auf dem Banner',
        hilfe: 'Dieselben Platzhalter, in einer Zeile.',
        mehrzeilig: false,
        grenze: 100,
        platzhalter: platzhalter('banner'),
        rechnung,
      },
      {
        art: 'aktion',
        id: 'test',
        titel: 'Testnachricht senden',
        laeuft: 'Wird gesendet …',
        hilfe:
          'Die Testnachricht nimmt den gespeicherten Stand, also speicher zuerst. Sie geht in den gespeicherten Kanal, alle dort sehen sie, und sie pingt niemanden.',
        ungespeichert: 'Du hast ungespeicherte Änderungen; die Testnachricht nimmt den gespeicherten Stand.',
      },
    ],
    daneben: [
      {
        art: 'vorschau',
        id: 'vorschau',
        titel: 'So schickt kitty das Banner, mit dir als Mitglied. Die Vorschau zeigt den gespeicherten Stand.',
        alt: 'Vorschau des Banners',
        breite,
        hoehe,
        braucht: 'bild',
        leer: { titel: 'Noch kein Bild.', text: 'Lade ein Bild hoch, dann siehst du hier das Banner.' },
        fehler: { titel: 'Keine Vorschau.', text: 'Die Vorschau liess sich nicht laden. Speicher noch einmal, dann versucht kitty es neu.' },
      },
    ],
  };
}

function art(seite: string): Art {
  if (seite === 'beitritt' || seite === 'abschied') return seite;
  throw new BausteinFehler(404, 'nicht_gefunden');
}

// Beitritt und Abschied als zwei Seiten des Dashboards.
// Siehe docs/schnittstelle/begruessung.md.
export function begruessungsBereich(o: BegruessungOptionen): Bereich<Kontext> {
  // Je Server über alle Sitzungen. Siehe docs/schnittstelle/begruessung.md, „Testnachricht“.
  const grenzeTest = new Grenze(3, 60_000, o.uhr, () => o.zaehlung?.griff('testnachricht'));
  const mitRoute = { bild: 'bild', vorschau: 'vorschau', test: 'aktion' } as const;

  return {
    seiten: { beitritt: mitRoute, abschied: mitRoute },

    async zeige({ server }) {
      const gespeichert = await lese(o.db, server.id);
      const liste = kanaele(server);
      const karte = new Map(liste.map((k) => [k.id, k]));
      const teile = bausteine(liste);
      return (['beitritt', 'abschied'] as const).map((a): Seite => {
        const wert = gespeichert[a];
        // Was der gespeicherte Stand heute nicht mehr besteht, steht beim Laden am Feld.
        const geprueft = pruefe(wert, karte, wert.bild);
        return {
          id: a,
          titel: titel[a],
          bausteine: teile.bausteine,
          daneben: teile.daneben,
          wert,
          saetze,
          fund: 'code' in geprueft ? geprueft : null,
        };
      });
    },

    async speichere({ server }, seite, eingabe) {
      const a = art(seite);
      const liste = kanaele(server);
      const { bild } = (await lese(o.db, server.id))[a];
      const ergebnis = pruefe(eingabe, new Map(liste.map((k) => [k.id, k])), bild);
      if ('code' in ergebnis) throw new BausteinFehler(400, ergebnis.code, ergebnis.feld);
      const e = ergebnis.einstellung;
      await speichere(o.db, server.id, a, e);
      o.einstellungen?.delete(server.id);
      const kanal = liste.find((k) => k.id === e.kanal);
      return {
        wert: e,
        meldung: {
          titel: 'Gespeichert.',
          text: e.an && kanal ? `kitty schreibt ab jetzt in #${kanal.name}.` : 'Solange „Aktiv“ aus ist, schickt kitty nichts.',
        },
      };
    },

    // Siehe docs/schnittstelle/begruessung.md, „Bild“.
    async ladeHoch({ server }, seite, _baustein, datei) {
      const a = art(seite);
      if (!bildtypen.includes(datei.typ)) throw new BausteinFehler(415, 'bildtyp');
      const daten = await datei.lies(bildGroesse, 'bild_zu_gross');
      const bild = await bereiteVor(daten).catch((fehler: unknown) => {
        throw fehler instanceof BildFehler ? new BausteinFehler(fehler.status, fehler.code) : fehler;
      });
      await speichereBild(o.db, server.id, a, bild);
      o.einstellungen?.delete(server.id);
    },

    async loesche({ server }, seite) {
      await loescheBild(o.db, server.id, art(seite));
      o.einstellungen?.delete(server.id);
    },

    // Das Banner mit der angemeldeten Person als Mitglied.
    async zeichne({ server, mitglied }, seite) {
      const a = art(seite);
      const { bannerText } = (await lese(o.db, server.id))[a];
      const png = await banner(alsMitglied(mitglied), a, bannerText, { db: o.db, avatar: o.avatar });
      if (!png) throw new BausteinFehler(404, 'kein_bild');
      return png;
    },

    // Siehe docs/schnittstelle/begruessung.md, „Testnachricht“.
    async loeseAus({ server, mitglied }, seite) {
      const a = art(seite);
      const e: Einstellung = (await lese(o.db, server.id))[a];
      if (!e.kanal) throw new BausteinFehler(400, 'test_ohne_kanal', 'kanal');
      const kanal = kanaele(server).find((k) => k.id === e.kanal);
      if (!kanal) throw new BausteinFehler(400, 'kanal_unbekannt', 'kanal');
      if (e.text.trim() === '' && !(e.banner && e.bild && kanal.banner)) throw new BausteinFehler(400, 'test_ohne_inhalt', 'text');
      // Erst nach Rechten und Regeln, direkt vor dem Senden: Eine fremde
      // Sitzung soll die Testnachricht eines Servers nicht sperren können.
      grenzeTest.raeume();
      const warten = grenzeTest.pruefe(server.id);
      if (warten > 0) throw new BausteinFehler(429, 'zu_viele', undefined, warten);
      const ziel = textkanal(server, e.kanal);
      if (!ziel) throw new Error('Kanal fehlt oder der Bot darf dort nicht senden');
      const gesendet = await sendeTest(alsMitglied(mitglied), ziel, a, e, { db: o.db, avatar: o.avatar });
      return {
        titel: e.banner && !gesendet.banner ? 'Gesendet, ohne Banner.' : 'Gesendet.',
        text: `Die Testnachricht steht in #${kanal.name}.`,
      };
    },
  };
}
