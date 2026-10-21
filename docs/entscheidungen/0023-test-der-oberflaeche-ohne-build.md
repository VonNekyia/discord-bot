---
title: "0023: Test der Oberfläche ohne Build"
description: Warum web/ seinen Test mit node --test direkt auf den TypeScript-Quellen laufen lässt; Node entfernt die Typen, erasableSyntaxOnly hält tsc daran, der Test ist JavaScript; kein zweites tsconfig, kein @types/node.
status: gilt
date: 2026-10-21
issues: [54]
code:
  - web/package.json
  - web/tsconfig.json
  - web/test/beispiele.test.mjs
  - web/src/api/klient.ts
---

# 0023: Test der Oberfläche ohne Build

## Anlass

Entscheidung [0022](0022-beispiele-als-vertragstest.md) gibt der
Oberfläche einen Test: Er misst die Prüfer aus `web/src/api/klient.ts` an
den Beispielen des Vertrags. Bis dahin hatte `web/` keinen Test. `tsc`
schreibt nach `web/dist/`, und von dort liefert `web/serve.mjs` aus. Der
Test braucht die Prüfer als JavaScript. Ausgeliefert werden soll davon
nichts, und eine neue Abhängigkeit soll es nicht geben (`AGENTS.md`,
Regel 23).

## Entscheidung

`npm test` in `web/` startet `node --test test/*.test.mjs`, ohne Build:

- Node liest `klient.ts` direkt und entfernt dabei nur die Typen, siehe
  [Type stripping](https://nodejs.org/api/typescript.html#type-stripping)
  in der Doku von Node. Node 24.20 tut das ohne Schalter und ohne Warnung;
  lokal geprüft.
- `erasableSyntaxOnly` in `web/tsconfig.json` hält `tsc` daran: Es baut
  kein TypeScript, das sich nicht einfach weglassen lässt. Daran bräche
  Node mit `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX` ab.
- Der Test ist JavaScript (`.mjs`). Er braucht so keine Typen für
  `node:test` und `node:assert`.
- Er liegt in `web/test/`, ausserhalb von `src/`. `tsc` baut ihn nicht, und
  `web/serve.mjs` liefert `.mjs` nicht aus.

Entscheidung [0003](0003-tsc-und-node-test.md) gilt nur für `bot/`: Dort
laufen die Tests gegen das gebaute JavaScript in `bot/dist/`. Für `web/`
gilt sie nicht.

## Verworfene Alternativen

- **Ein zweites `tsconfig` für Tests mit eigenem `outDir`.** Ein zweiter
  Build in einen Ordner, den niemand ausliefern darf, und ein Schritt mehr
  vor jedem Test. Node liest die Quellen selbst.
- **Der Test in TypeScript, mit `@types/node`.** Eine neue
  Dev-Abhängigkeit nur für Typen im Test (Regel 23). Der Test prüft Werte
  zur Laufzeit; Typen gewinnen dort wenig.

## Folgen

- In `web/src/` steht keine Syntax, die Node nicht weglassen kann: keine
  Parameter-Properties, kein `enum`, kein `namespace`, kein
  `import … = require(…)`. `tsc` meldet sie als Fehler TS1294. Darum haben
  `ApiFehler` in `klient.ts` und `Feld` in `web/src/kern/feld.ts`
  ausgeschriebene Felder.
- `node --test` nimmt keinen Ordner: `node --test test/` bricht mit
  `MODULE_NOT_FOUND` ab (Node 24.20, lokal geprüft). Darum nennt `npm test`
  das Muster `test/*.test.mjs`.
- Ein Test kann nur Dateien laden, die nichts Eigenes importieren. Die
  Importe in `web/src/` enden auf `.js`, und diese Dateien gibt es nur in
  `dist/`; Node sucht keine `.ts` dafür (lokal geprüft). `klient.ts`
  importiert nichts, siehe
  [Struktur von Bot und Oberfläche](../entwicklung/struktur.md), „Grenzen“.
  Braucht ein späterer Test mehr, ist das eine neue Entscheidung.
- `tsc` prüft den Test nicht; oxlint prüft ihn als JavaScript.
