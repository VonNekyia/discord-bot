// Zeichen, die der Bot nie schreibt, und ein Ersatz für Namen, von denen
// nichts bleibt. Siehe docs/entscheidungen/0018-zierbuchstaben-und-filter.md.

// Hakenkreuze: U+534D, U+5350, U+0FD5 bis U+0FD8.
const hakenkreuze = /[\u534D\u5350\u0FD5-\u0FD8]/gu;
// Zwei oder mehr SS-Runen aus U+16CB, U+16CA und U+03DF, auch gemischt.
// Unsichtbare Zeichen dazwischen, etwa ZWJ, zählen nicht.
const runen = /[\u16CB\u16CA\u03DF](?:\p{Default_Ignorable_Code_Point}*[\u16CB\u16CA\u03DF])+/gu;
// Nichts, was man sieht: Leerraum und unsichtbare Zeichen.
const unsichtbar = /^[\s\p{Default_Ignorable_Code_Point}]*$/u;

// `text` ohne Hakenkreuze und SS-Runen. Erst die Hakenkreuze: Aus Rune,
// Hakenkreuz, Rune wird so ein Paar, das dann auch fällt.
export function ohneHasszeichen(text: string): string {
  return text.replaceAll(hakenkreuze, '').replaceAll(runen, '');
}

// `name`, ausser es bleibt nichts zu sehen; dann `benutzername`. Der
// Benutzername von Discord hat nur a–z, 0–9, `_` und `.`.
export function nameOder(name: string, benutzername: string): string {
  return unsichtbar.test(name) ? benutzername : name;
}
