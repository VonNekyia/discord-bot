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

// "(MIT OR GPL-3.0)" reicht eine Wahl, "MIT AND CC-BY-3.0" braucht beide.
function permissiv(lizenz) {
  return String(lizenz ?? '')
    .replace(/[()]/g, '')
    .split(/\s+OR\s+/)
    .some((wahl) => wahl.split(/\s+AND\s+/).every((teil) => erlaubt.has(teil.trim())));
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
