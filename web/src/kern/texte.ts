// Die Sätze zu den Fehlercodes der API und die Meldungen aus dem Guide.
// Der erste Satz sagt, was passiert ist, der zweite, was zu tun ist.
// Siehe docs/frontend/dashboard.md, „Meldungen“.
import { ApiFehler, type Satz } from '../api/klient.js';

// Codes, die jede Seite melden kann; die Sätze zu den Codes einer Seite
// liefert sie selbst. Siehe docs/schnittstelle/api.md, „Fehler“.
const saetze: Record<string, Satz> = {
  anmeldung: { titel: 'Die Anmeldung hat nicht geklappt.', text: 'Versuch es noch einmal.' },
  abgelaufen: { titel: 'Deine Anmeldung ist abgelaufen.', text: 'Melde dich neu an.' },
  nicht_erreichbar: { titel: 'kitty antwortet gerade nicht.', text: 'Versuch es in ein paar Minuten noch einmal.' },
  kein_recht: { titel: 'Du darfst diesen Server nicht verwalten.', text: 'Wähl einen anderen Server.' },
  nicht_gefunden: { titel: 'kitty ist nicht mehr auf diesem Server.', text: 'Wähl einen anderen Server.' },
  zu_gross: { titel: 'Das ist zu viel auf einmal.', text: 'Kürz den Text und speicher noch einmal.' },
  steuerzeichen: {
    titel: 'Im Text steht ein unsichtbares Zeichen, das kitty nicht speichern kann.',
    text: 'Tipp die Stelle neu oder füg den Text als reinen Text ein.',
  },
};

const unbekannt: Satz = { titel: 'Das hat nicht geklappt.', text: 'Lade die Seite neu und versuch es noch einmal.' };

// Der Satz zu einem Code oder einem Fehler; `eigene` sind die Sätze einer
// Seite. Für alles Unbekannte ein allgemeiner.
export function satz(fehler: unknown, eigene: Readonly<Record<string, Satz>> = {}): Satz {
  if (fehler instanceof ApiFehler && fehler.code === 'zu_viele') {
    return { titel: 'Zu viele Anfragen in kurzer Zeit.', text: `Versuch es in ${fehler.warten ?? 60} Sekunden noch einmal.` };
  }
  const code = fehler instanceof ApiFehler ? fehler.code : typeof fehler === 'string' ? fehler : '';
  return eigene[code] ?? saetze[code] ?? unbekannt;
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
