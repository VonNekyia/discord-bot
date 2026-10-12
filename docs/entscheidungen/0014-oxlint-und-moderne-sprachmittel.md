---
title: "0014: oxlint als Linter, moderne Sprachmittel"
description: Warum bot/ und web/ mit oxlint und typbasierten Regeln geprüft werden, statt nur mit tsc oder mit ESLint, und warum der Bot für ES2025 und die Oberfläche für ES2024 baut.
status: gilt
date: 2026-10-12
issues: []
code:
  - .oxlintrc.json
  - bot/tsconfig.json
  - web/tsconfig.json
---

# 0014: oxlint als Linter, moderne Sprachmittel

Löst aus [0003](0003-tsc-und-node-test.md) den Teil ab, dass `tsc` der
einzige Lint ist. `tsc` baut und prüft die Typen weiter, die Tests laufen
weiter mit `node:test`.

## Anlass

Der Maintainer will einen Linter und, wo es passt, die modernsten
Sprachmittel. `tsc` findet keine ungewarteten Promises, keine unsicheren
Casts und keine Kreise zwischen Dateien, und es sagt nicht, wo ein
neueres Sprachmittel passt. Ein Probelauf fand im Bestand:

- einen async-Zuhörer an `ClientReady` in `bot/src/index.ts`, dessen
  Fehler niemand fing;
- 45 Casts und `!` an Eingaben von aussen im Bot, 28 in der Oberfläche;
- `sort` auf Kopien, `replace` mit `/g`, ein `Error` ohne `cause`.

## Entscheidung

`oxlint` 1.87 und `oxlint-tsgolint` 7.0, beide MIT, als Dev-Abhängigkeit
in `bot/` und `web/`. Die Regeln stehen in `.oxlintrc.json`, der Schritt
„Lint“ läuft in den Jobs „Backend“ und „Frontend“. Was beim Einführen
schon da war und nicht schnell geht, bleibt eine Warnung mit fester
Obergrenze. `bot/` baut für ES2025, `web/` für ES2024, beide mit
`verbatimModuleSyntax`. Wie das geht, steht in
[Lint mit oxlint](../entwicklung/lint.md).

## Verworfene Alternativen

- **ESLint mit typescript-eslint.** typescript-eslint 8.71 verlangt
  `typescript` unter 6.1; wir bauen mit TypeScript 7. Für typbasierte
  Regeln bräuchte es eine zweite, alte TypeScript-Fassung nur fürs
  Linten. ESLint 10, typescript-eslint und TypeScript 6 sind zusammen
  95 Pakete, oxlint und oxlint-tsgolint 2 und eine Binärdatei je
  Plattform.
- **Biome.** Leitet Typen selbst ab, ohne den Compiler. Die typbasierten
  Regeln von oxlint nutzen TypeScript 7 selbst und sehen dieselben Typen
  wie `tsc`.
- **Nur `tsc` wie bisher.** Findet die Fälle im Anlass nicht.
- **Alles sofort beheben.** Die 73 Altlasten sitzen an der Grenze zu
  discord.js, zur API und zum DOM. Sie gehören zum Umbau der Struktur,
  nicht zum Einführen des Linters.
- **ES2025 auch für `web/`.** Iterator-Helfer und die Methoden von `Set`
  fehlen in älteren Browsern, und `tsc` ergänzt sie nicht.

## Folgen

- Je Paket zwei Dev-Abhängigkeiten mehr, dazu eine Binärdatei je
  Plattform.
- `npm run lint` gehört vor jeden Push; die CI zeigt jeden Fund an seiner
  Zeile in der PR.
- Neue Altlasten gibt es nicht: Eine neue Warnung überschreitet
  `maxWarnings`.
- Formatieren bleibt Sache des Reviews, wie in 0003.
