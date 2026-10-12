// Die Länge eines Texts, wie der Bot sie prüft: jeder Platzhalter mit seinem
// längsten Wert, so oft er vorkommt; ein Zeichen ist eine UTF-16-Einheit.
// Siehe docs/schnittstelle/baukasten.md, „Länge eines Texts“.
export function laenge(text: string, platzhalter: Readonly<Record<string, number>>): number {
  let summe = text.length;
  for (const [name, wert] of Object.entries(platzhalter)) {
    const zeichen = `{${name}}`;
    summe += (text.split(zeichen).length - 1) * (wert - zeichen.length);
  }
  return summe;
}
