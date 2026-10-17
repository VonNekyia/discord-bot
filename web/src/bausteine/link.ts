// Ein Link nach aussen: Link im Text aus dem Guide („Links“, „In text“), in
// einem neuen Tab, darunter die Hilfe. Nur zu https://discord.com/; das prüft
// src/api/klient.ts. Siehe docs/schnittstelle/baukasten.md, „Bausteine“.
import type { Link } from '../api/klient.js';
import { schreibe } from '../kern/feld.js';
import type { Bauer } from '../kern/teil.js';

export const link: Bauer<Link> = (b, u) => {
  const absatz = document.createElement('p');
  const a = document.createElement('a');
  a.id = u.id(b.id);
  a.href = b.url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.textContent = b.titel;
  absatz.append(a);
  if (!b.hilfe) return { elemente: [absatz] };
  const hilfe = document.createElement('span');
  hilfe.className = 'help';
  hilfe.id = u.id(`${b.id}-hilfe`);
  schreibe(hilfe, b.hilfe);
  a.setAttribute('aria-describedby', hilfe.id);
  return { elemente: [absatz, hilfe] };
};
