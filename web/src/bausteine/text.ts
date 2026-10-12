// Ein Text: Textfeld oder Textarea aus dem Guide („Text fields and text
// area“). Die Hilfe zeigt beim Tippen, wie viele Zeichen frei sind, mit
// jedem Platzhalter in seiner längsten Länge.
// Siehe docs/schnittstelle/baukasten.md, „Bausteine“.
import type { Text } from '../api/klient.js';
import { Feld, schreibe } from '../kern/feld.js';
import { laenge } from '../kern/laenge.js';
import type { Bauer } from '../kern/teil.js';

export const text: Bauer<Text> = (b, u, start) => {
  const eingabe = document.createElement(b.mehrzeilig ? 'textarea' : 'input');
  if (eingabe instanceof HTMLInputElement) eingabe.type = 'text';
  eingabe.value = typeof start === 'string' ? start : '';
  const feld = new Feld(u, b.id, b.titel, eingabe, b.hilfe);
  const zusatz = b.rechnung ? `, ${b.rechnung}` : '';

  const rest = () => {
    const l = laenge(eingabe.value, b.platzhalter);
    const satz = l <= b.grenze ? `Noch ${b.grenze - l} von ${b.grenze} Zeichen frei${zusatz}.` : `${l - b.grenze} Zeichen zu viel${zusatz}.`;
    schreibe(feld.zusatz, b.hilfe ? ` ${satz}` : satz);
    feld.zeigeHilfe();
  };
  rest();
  // Ob der Fehler am Feld aus einer Antwort des Bots kommt.
  let vomBot = false;
  eingabe.addEventListener('input', () => {
    vomBot = false;
    feld.fehler(null);
    rest();
    u.geaendert();
  });

  // Erst NUL, das der Bot als ungueltig ablehnt, dann Pflicht, dann die Länge.
  // Siehe docs/schnittstelle/baukasten.md, „Prüfen in der Oberfläche“.
  const pruefe = (alles: boolean): boolean => {
    vomBot = false;
    const wert = eingabe.value;
    const l = laenge(wert, b.platzhalter);
    if (wert.includes('\0')) feld.fehler(u.satz('steuerzeichen'));
    else if (alles && b.pflicht && wert.trim() === '') feld.fehler(u.satz(b.pflicht));
    else if (l > b.grenze) feld.fehler({ titel: 'Der Text ist zu lang.', text: `Kürz ihn um ${l - b.grenze} Zeichen.` });
    else {
      feld.fehler(null);
      return true;
    }
    return false;
  };

  // Die Oberfläche schickt immer Text; ungueltig heisst darum NUL.
  const melde = (code: string): boolean => {
    feld.fehler(u.satz(code === 'ungueltig' ? 'steuerzeichen' : code));
    vomBot = true;
    return true;
  };

  const vergiss = () => {
    if (vomBot) pruefe(false);
  };

  return { elemente: [feld.element], wert: () => eingabe.value, pruefe, melde, vergiss };
};
