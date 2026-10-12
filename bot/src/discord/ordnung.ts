// Ein Kanal, wie Discord ihn sortiert.
interface Platz {
  id: string;
  rawPosition: number;
}

// Nach Position, bei gleicher nach ID.
export function vergleiche(x: Platz, y: Platz): number {
  return x.rawPosition - y.rawPosition || (BigInt(x.id) < BigInt(y.id) ? -1 : 1);
}

// Sortiert wie Discord: zuerst die Kanäle ohne Kategorie, dann die
// Kategorien nach ihrer Position; in einer Gruppe nach Position, bei
// gleicher nach ID. Siehe docs/schnittstelle/begruessung.md, „Bausteine“.
export function wieDiscord<T extends Platz & { parent: Platz | null }>(liste: T[]): T[] {
  return liste.toSorted((x, y) => {
    if (x.parent?.id === y.parent?.id) return vergleiche(x, y);
    if (!x.parent) return -1;
    if (!y.parent) return 1;
    return vergleiche(x.parent, y.parent);
  });
}
