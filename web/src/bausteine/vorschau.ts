// Eine Vorschau: Bild mit Unterschrift aus dem Guide („Picture with
// caption“), sonst der leere Zustand. Lädt neu nach dem Speichern und nach
// jedem Hochladen; der Browser zeigt sonst das alte Bild.
// Siehe docs/schnittstelle/baukasten.md, „Bausteine“.
import type { Satz, Vorschau } from '../api/klient.js';
import type { Bauer } from '../kern/teil.js';

export const vorschau: Bauer<Vorschau> = (b, u) => {
  const figur = document.createElement('figure');
  figur.className = 'figure-card';
  const rahmen = document.createElement('div');
  rahmen.className = 'picture';
  const bild = new Image(b.breite, b.hoehe);
  bild.alt = b.alt;
  rahmen.append(bild);
  const unterschrift = document.createElement('figcaption');
  unterschrift.textContent = b.titel;
  figur.append(rahmen, unterschrift);

  const leer = document.createElement('div');
  leer.className = 'empty';
  const titel = document.createElement('h4');
  const text = document.createElement('p');
  leer.append(titel, text);

  const zeigeLeer = (satz: Satz) => {
    figur.hidden = true;
    leer.hidden = false;
    titel.textContent = satz.titel;
    text.textContent = satz.text;
  };
  // Den Fehlercode eines img sieht die Seite nicht; darum ein Satz für alles.
  bild.addEventListener('error', () => zeigeLeer(b.fehler));

  const ladeNeu = () => {
    if (u.wert(b.braucht) !== true) return zeigeLeer(b.leer);
    bild.src = u.bild(b.id);
    figur.hidden = false;
    leer.hidden = true;
  };

  return { elemente: [figur, leer], ladeNeu };
};
