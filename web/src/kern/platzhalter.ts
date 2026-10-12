// Rechnet die Länge eines Texts so, wie das Backend sie prüft: jeder
// Platzhalter mit seinem längsten Wert, ein Zeichen ist eine UTF-16-Einheit.
// Siehe docs/benutzung/begruessung.md, „Platzhalter“, und
// docs/schnittstelle/begruessung.md, „Einstellung speichern“.

type Werte = { nutzer: number; name: number; server: number; anzahl: number };

const imText: Werte = { nutzer: 23, name: 64, server: 200, anzahl: 10 };
const imBanner: Werte = { nutzer: 33, name: 32, server: 100, anzahl: 10 };

export const grenzeText = 2000;
export const grenzeBanner = 100;

function laenge(text: string, werte: Werte): number {
  let summe = text.length;
  for (const [platzhalter, name] of text.matchAll(/\{(nutzer|name|server|anzahl)\}/g)) {
    summe += werte[name as keyof Werte] - platzhalter.length;
  }
  return summe;
}

export const laengeImText = (text: string) => laenge(text, imText);
export const laengeImBanner = (text: string) => laenge(text, imBanner);

// Namen der Sprachräume kennen nur {name}, mit höchstens 32 Zeichen.
// Siehe docs/schnittstelle/sprachraeume.md, „Sprachräume einstellen“.
export const grenzeRaumname = 100;
export const laengeImRaumnamen = (vorlage: string) => vorlage.length + (vorlage.split('{name}').length - 1) * (32 - '{name}'.length);
