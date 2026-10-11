// Die Sätze zu den Fehlercodes der API und die Meldungen aus dem Guide.
// Der erste Satz sagt, was passiert ist, der zweite, was zu tun ist.
// Siehe docs/frontend/dashboard.md, „Meldungen“.
import { ApiFehler } from './api.js';

export type Satz = { titel: string; text: string };

const saetze: Record<string, Satz> = {
  anmeldung: { titel: 'Die Anmeldung hat nicht geklappt.', text: 'Versuch es noch einmal.' },
  abgelaufen: { titel: 'Deine Anmeldung ist abgelaufen.', text: 'Melde dich neu an.' },
  nicht_erreichbar: { titel: 'kitty antwortet gerade nicht.', text: 'Versuch es in ein paar Minuten noch einmal.' },
  kein_recht: { titel: 'Du darfst diesen Server nicht verwalten.', text: 'Wähl einen anderen Server.' },
  nicht_gefunden: { titel: 'kitty ist nicht mehr auf diesem Server.', text: 'Wähl einen anderen Server.' },
  kanal_unbekannt: {
    titel: 'Diesen Kanal gibt es nicht mehr, oder kitty darf dort nicht schreiben.',
    text: 'Wähl einen neuen Kanal.',
  },
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
  zu_gross: { titel: 'Das ist zu viel auf einmal.', text: 'Kürz den Text und speicher noch einmal.' },
  test_ohne_kanal: { titel: 'Im gespeicherten Stand ist kein Kanal gewählt.', text: 'Wähl einen Kanal und speicher, dann geht die Testnachricht.' },
  test_ohne_inhalt: {
    titel: 'Im gespeicherten Stand gibt es nichts zu senden.',
    text: 'Schreib einen Text oder schalte das Banner ein und speicher.',
  },
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
  steuerzeichen: {
    titel: 'Im Text steht ein unsichtbares Zeichen, das kitty nicht speichern kann.',
    text: 'Tipp die Stelle neu oder füg den Text als reinen Text ein.',
  },
};

const unbekannt: Satz = { titel: 'Das hat nicht geklappt.', text: 'Lade die Seite neu und versuch es noch einmal.' };

// Der Satz zu einem Code oder einem Fehler; für alles Unbekannte ein allgemeiner.
export function satz(fehler: unknown): Satz {
  if (fehler instanceof ApiFehler && fehler.code === 'zu_viele') {
    return { titel: 'Zu viele Anfragen in kurzer Zeit.', text: `Versuch es in ${fehler.warten ?? 60} Sekunden noch einmal.` };
  }
  const code = fehler instanceof ApiFehler ? fehler.code : typeof fehler === 'string' ? fehler : '';
  return saetze[code] ?? unbekannt;
}

// Setzt eine Meldung aus dem Guide („Messages“) in das Ziel, oder leert es.
export function meldung(ziel: HTMLElement, art: 'ok' | 'warn' | 'error' | 'info', inhalt: Satz): void {
  const kasten = document.createElement('div');
  kasten.className = `message message-${art}`;
  const innen = document.createElement('div');
  const titel = document.createElement('strong');
  titel.textContent = inhalt.titel;
  innen.append(titel, inhalt.text);
  kasten.append(innen);
  ziel.replaceChildren(kasten);
}
