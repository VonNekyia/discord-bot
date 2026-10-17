// Ein Schalter: Checkbox aus dem Guide („Checkbox, radio and switch“). Mit
// `gesperrt` immer gesperrt und aus, mit `braucht`, solange eine Bedingung
// fehlt; dann sagt die Hilfe, warum. Siehe docs/schnittstelle/baukasten.md, „Bausteine“.
import type { Schalter } from '../api/klient.js';
import { schreibe } from '../kern/feld.js';
import { erfuellt, type Bauer } from '../kern/teil.js';

export const schalter: Bauer<Schalter> = (b, u, start) => {
  const label = document.createElement('label');
  label.className = 'choice';
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.id = u.id(b.id);
  box.checked = start === true;
  label.append(box, ` ${b.titel}`);
  const hilfe = document.createElement('span');
  hilfe.className = 'help';
  hilfe.id = u.id(`${b.id}-hilfe`);
  box.setAttribute('aria-describedby', hilfe.id);
  box.addEventListener('change', () => u.geaendert());

  const aktualisiere = (): boolean => {
    const fehlt = b.gesperrt?.grund ?? b.braucht?.find((bedingung) => !erfuellt(bedingung, u))?.sonst;
    schreibe(hilfe, fehlt ?? b.hilfe ?? '');
    hilfe.hidden = hilfe.textContent === '';
    box.disabled = fehlt !== undefined;
    if (fehlt === undefined || !box.checked) return false;
    box.checked = false;
    return true;
  };

  return { elemente: [label, hilfe], wert: () => box.checked, aktualisiere };
};
