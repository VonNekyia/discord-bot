// Eine Zahl: Zahlfeld im Feld aus dem Guide („Text fields and text area“),
// ganze Zahlen von `min` bis `max`. Siehe docs/schnittstelle/baukasten.md, „Bausteine“.
import type { Zahl } from '../api/klient.js';
import { Feld } from '../kern/feld.js';
import type { Bauer } from '../kern/teil.js';

export const zahl: Bauer<Zahl> = (b, u, start) => {
  const eingabe = document.createElement('input');
  eingabe.type = 'number';
  eingabe.min = String(b.min);
  eingabe.max = String(b.max);
  eingabe.step = '1';
  eingabe.inputMode = 'numeric';
  eingabe.value = typeof start === 'number' ? String(start) : '';
  const feld = new Feld(u, b.id, b.titel, eingabe, b.hilfe);
  // Ob der Fehler am Feld aus einer Antwort des Bots kommt.
  let vomBot = false;
  eingabe.addEventListener('input', () => {
    vomBot = false;
    feld.fehler(null);
    u.geaendert();
  });

  // Ein leeres Feld ist keine Zahl; JSON kennt NaN nicht, darum null.
  const wert = () => {
    const z = eingabe.value.trim() === '' ? Number.NaN : Number(eingabe.value);
    return Number.isNaN(z) ? null : z;
  };

  const pruefe = (): boolean => {
    vomBot = false;
    const z = wert();
    const gut = z !== null && Number.isInteger(z) && z >= b.min && z <= b.max;
    feld.fehler(gut ? null : u.satz(b.ungueltig));
    return gut;
  };

  const melde = (code: string): boolean => {
    feld.fehler(u.satz(code));
    vomBot = true;
    return true;
  };

  const vergiss = () => {
    if (vomBot) pruefe();
  };

  return { elemente: [feld.element], wert, pruefe, melde, vergiss };
};
