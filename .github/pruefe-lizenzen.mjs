// Prüft die Lizenzen der Laufzeit-Abhängigkeiten in einem package-lock.json:
//
//   node .github/pruefe-lizenzen.mjs bot/package-lock.json
//
// Nur permissive Lizenzen. Pakete mit "dev": true gehen nicht mit aus und
// bleiben ungeprüft. Jeder Verstoss steht als "::error file=…::…" da; dann
// Exit 1. Siehe docs/entwicklung/ci.md, „Lizenzen“.
import { readFileSync } from 'node:fs';

const erlaubt = new Set([
  '0BSD', 'Apache-2.0', 'BlueOak-1.0.0', 'BSD-2-Clause', 'BSD-3-Clause',
  'CC0-1.0', 'ISC', 'MIT', 'MIT-0', 'Unlicense',
]);

// Wertet einen SPDX-Ausdruck aus: Klammern zuerst, AND bindet stärker als OR.
// "(MIT OR GPL-3.0)" reicht eine Wahl, "MIT AND CC-BY-3.0" braucht beide.
// WITH und alles, was sich nicht lesen lässt, ist nicht erlaubt.
// Siehe docs/entwicklung/ci.md, „Lizenzen“.
function permissiv(lizenz) {
  const teile = String(lizenz ?? '').match(/[()]|[^\s()]+/g) ?? [];
  let i = 0;
  const oder = () => {
    let ok = und();
    while (teile[i] === 'OR') {
      i++;
      ok = und() || ok;
    }
    return ok;
  };
  const und = () => {
    let ok = einzeln();
    while (teile[i] === 'AND') {
      i++;
      ok = einzeln() && ok;
    }
    return ok;
  };
  const einzeln = () => {
    const teil = teile[i++];
    if (teil === '(') {
      const ok = oder();
      if (teile[i++] !== ')') throw new Error('Klammer offen');
      return ok;
    }
    if (teil === undefined || ['AND', 'OR', 'WITH', ')'].includes(teil)) throw new Error('Lizenz fehlt');
    if (teile[i] === 'WITH') {
      i += 2;
      return false;
    }
    return erlaubt.has(teil);
  };
  try {
    return oder() && i === teile.length;
  } catch {
    return false;
  }
}

const datei = process.argv[2];
const pakete = JSON.parse(readFileSync(datei, 'utf8')).packages;
let fehler = 0;
for (const [pfad, paket] of Object.entries(pakete)) {
  if (pfad === '' || paket.dev || permissiv(paket.license)) continue;
  console.log(`::error file=${datei}::${pfad}: Lizenz ${paket.license ?? 'fehlt'} ist nicht erlaubt`);
  fehler = 1;
}
process.exit(fehler);
