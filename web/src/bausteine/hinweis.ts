// Ein Hinweis: Meldung aus dem Guide („Messages“) an ihrer Stelle im
// Formular. Siehe docs/schnittstelle/baukasten.md, „Bausteine“.
import type { Hinweis } from '../api/klient.js';
import { meldung } from '../kern/texte.js';
import type { Bauer } from '../kern/teil.js';

export const hinweis: Bauer<Hinweis> = (b) => {
  const element = document.createElement('div');
  meldung(element, b.ton, b.satz);
  return { elemente: [element] };
};
