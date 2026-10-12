// Typwächter für Eingaben von aussen, etwa den Body einer Seite. Nach der
// Prüfung kennt TypeScript den Typ, ohne Cast. Siehe docs/entwicklung/lint.md, „Altlasten“.

// Ein Objekt mit Feldern, kein Array und nicht null.
export function istObjekt(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

// Ein Text ohne NUL; PostgreSQL nimmt kein NUL in Text.
export function ohneNul(x: unknown): x is string {
  return typeof x === 'string' && !x.includes('\0');
}
