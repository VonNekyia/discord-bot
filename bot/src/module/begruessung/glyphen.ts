import { closeSync, openSync, readSync } from 'node:fs';

// Welche Zeichen die Schriften des Banners haben, aus ihrer Tabelle `cmap`.
// Siehe docs/entscheidungen/0018-zierbuchstaben-und-filter.md.

// Zeichen, die HarfBuzz nicht zeichnet: ZWJ, VS16, Tags, Bidi-Steuerzeichen.
// Sie bleiben immer; ein Kästchen gibt es für sie nicht.
const unsichtbar = /^\p{Default_Ignorable_Code_Point}$/u;

function lies(datei: number, stelle: number, laenge: number): Buffer {
  const puffer = Buffer.alloc(laenge);
  if (readSync(datei, puffer, 0, laenge, stelle) !== laenge) throw new Error('Schrift zu kurz');
  return puffer;
}

// Die Bereiche [von, bis] mit einer Glyphe aus einer `cmap`. Nur Format 12,
// Unicode ganz (3/10, sonst 0/4 oder 0/6); fehlt es, wirft sie.
export function bereicheAus(cmap: Buffer): [number, number][] {
  const anzahl = cmap.readUInt16BE(2);
  for (let i = 0; i < anzahl; i++) {
    const plattform = cmap.readUInt16BE(4 + 8 * i);
    const kodierung = cmap.readUInt16BE(6 + 8 * i);
    const stelle = cmap.readUInt32BE(8 + 8 * i);
    const passt = (plattform === 3 && kodierung === 10) || (plattform === 0 && (kodierung === 4 || kodierung === 6));
    if (!passt || cmap.readUInt16BE(stelle) !== 12) continue;
    const bereiche: [number, number][] = [];
    for (let g = 0; g < cmap.readUInt32BE(stelle + 12); g++) {
      const q = stelle + 16 + 12 * g;
      // Glyphe 0 ist das Kästchen; dieses eine Zeichen hat keine.
      const von = cmap.readUInt32BE(q) + (cmap.readUInt32BE(q + 8) === 0 ? 1 : 0);
      const bis = cmap.readUInt32BE(q + 4);
      if (von <= bis) bereiche.push([von, bis]);
    }
    return bereiche;
  }
  throw new Error('keine cmap im Format 12');
}

// Liest aus einer TrueType- oder OpenType-Datei nur das Verzeichnis der
// Tabellen und die `cmap`.
export function leseBereiche(pfad: string): [number, number][] {
  const datei = openSync(pfad, 'r');
  try {
    const tabellen = lies(datei, 4, 2).readUInt16BE(0);
    const verzeichnis = lies(datei, 12, 16 * tabellen);
    for (let i = 0; i < tabellen; i++) {
      if (verzeichnis.toString('latin1', 16 * i, 16 * i + 4) !== 'cmap') continue;
      return bereicheAus(lies(datei, verzeichnis.readUInt32BE(16 * i + 8), verzeichnis.readUInt32BE(16 * i + 12)));
    }
    throw new Error('keine cmap');
  } catch (fehler) {
    throw new Error(`Schrift ${pfad.split(/[\\/]/).at(-1)}: ${fehler instanceof Error ? fehler.message : String(fehler)}`, { cause: fehler });
  } finally {
    closeSync(datei);
  }
}

// Alle Zeichen, die eine der Schriften hat, als sortierte Bereiche.
export class Glyphen {
  // Paare von, bis; zusammengelegt und sortiert.
  private readonly bereiche: Uint32Array;

  constructor(je: readonly (readonly [number, number])[][]) {
    const alle = je.flat().toSorted((a, b) => a[0] - b[0]);
    const zusammen: number[] = [];
    for (const [von, bis] of alle) {
      const letztes = zusammen.length - 1;
      if (letztes > 0 && von <= (zusammen[letztes] ?? 0) + 1) zusammen[letztes] = Math.max(zusammen[letztes] ?? 0, bis);
      else zusammen.push(von, bis);
    }
    this.bereiche = Uint32Array.from(zusammen);
  }

  // Hat eine der Schriften eine Glyphe für `zeichen`?
  hat(zeichen: number): boolean {
    let unten = 0;
    let oben = this.bereiche.length / 2 - 1;
    while (unten <= oben) {
      const mitte = (unten + oben) >> 1;
      if (zeichen < (this.bereiche[2 * mitte] ?? 0)) oben = mitte - 1;
      else if (zeichen > (this.bereiche[2 * mitte + 1] ?? 0)) unten = mitte + 1;
      else return true;
    }
    return false;
  }

  // `text`, wie das Banner ihn ohne Kästchen zeichnen kann. Ein Zeichen, das
  // keine Schrift hat, wird zu seiner Form nach NFKC, 𝕿 etwa zu T; was auch
  // dann keine Glyphe hat, fällt weg. Unsichtbare Zeichen bleiben.
  zeichenbar(text: string): string {
    let aus = '';
    for (const zeichen of text) {
      if (this.bleibt(zeichen)) {
        aus += zeichen;
        continue;
      }
      for (const ersatz of zeichen.normalize('NFKC')) if (ersatz !== zeichen && this.bleibt(ersatz)) aus += ersatz;
    }
    return aus;
  }

  private bleibt(zeichen: string): boolean {
    return unsichtbar.test(zeichen) || this.hat(zeichen.codePointAt(0) ?? 0);
  }
}
