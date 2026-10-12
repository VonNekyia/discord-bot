// Eine Aktion: Link-Knopf unter „Speichern“, darunter Hilfe und Meldung.
// Sie nimmt den gespeicherten Stand; weicht das Formular ab, sagt die Hilfe
// das. Siehe docs/schnittstelle/baukasten.md, „Bausteine“.
import type { Aktion } from '../api/klient.js';
import { schreibe } from '../kern/feld.js';
import { meldung } from '../kern/texte.js';
import type { Bauer } from '../kern/teil.js';

export const aktion: Bauer<Aktion> = (b, u) => {
  const knopf = document.createElement('button');
  knopf.type = 'button';
  knopf.className = 'link-button';
  knopf.textContent = b.titel;
  const hilfe = document.createElement('span');
  hilfe.className = 'help';
  hilfe.id = u.id(`${b.id}-hilfe`);
  knopf.setAttribute('aria-describedby', hilfe.id);
  const meldungen = document.createElement('div');
  meldungen.setAttribute('role', 'status');

  const aktualisiere = (): boolean => {
    const anders = b.ungespeichert && u.ungespeichert() ? b.ungespeichert : '';
    schreibe(hilfe, [b.hilfe ?? '', anders].filter(Boolean).join(' '));
    hilfe.hidden = hilfe.textContent === '';
    return false;
  };

  knopf.addEventListener('click', () => {
    meldungen.replaceChildren();
    u.pruefeNeu();
    knopf.disabled = true;
    knopf.textContent = b.laeuft;
    void (async () => {
      try {
        meldung(meldungen, 'ok', await u.ausloesen(b.id));
      } catch (fehler) {
        u.zeige(fehler, meldungen);
      } finally {
        knopf.disabled = false;
        knopf.textContent = b.titel;
      }
    })();
  });

  return { elemente: [knopf, hilfe, meldungen], aktualisiere };
};
