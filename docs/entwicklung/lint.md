---
title: Lint mit oxlint
description: Wie bot/ und web/ mit oxlint geprüft werden, welche Regeln gelten und warum, welche modernen Sprachmittel sie verlangen, was in Tests anders ist, welche Altlasten Warnungen sind und wie man eine Regel begründet abschaltet.
code:
  - .oxlintrc.json
  - bot/.oxlintrc.json
  - web/.oxlintrc.json
  - bot/tsconfig.json
  - web/tsconfig.json
  - bot/src/kern/eingabe.ts
---

# Lint mit oxlint

`oxlint` prüft `bot/` und `web/` mit Regeln, die über `tsc` hinausgehen:
ungewartete Promises, unsichere Casts, Kreise zwischen Dateien und
veraltete Sprachmittel. Die typbasierten Regeln kommen von
`oxlint-tsgolint`, das auf TypeScript 7 aufbaut. `tsc` baut und prüft die
Typen weiter. Warum oxlint, steht in
[0014](../entscheidungen/0014-oxlint-und-moderne-sprachmittel.md).

## Aufrufen

```bash
npm run lint              # in bot/ oder web/
npx oxlint --fix          # behebt, was ohne Risiko geht
```

In der CI läuft der Schritt „Lint“ in den Jobs „Backend“ und „Frontend“,
siehe [CI und Ablauf einer PR](ci.md). Mit `--format=github` steht jeder
Fund als Anmerkung an seiner Zeile in der PR. oxlint nennt Pfade ab
`bot/` oder `web/`; der Schritt setzt das Paket davor, damit GitHub die
Zeile findet.

## Konfiguration

| Datei | Inhalt |
|---|---|
| `.oxlintrc.json` | gemeinsame Regeln, `typeAware`, Ausnahmen für Tests |
| `bot/.oxlintrc.json`, `web/.oxlintrc.json` | erben die gemeinsamen über `extends`; dazu `dist` ausgenommen, die Grenzen der Schichten aus [Struktur von Bot und Oberfläche](struktur.md), „Grenzen“, die Altlasten und `maxWarnings` |

Die Kategorien `correctness`, `suspicious` und `perf` stehen ganz auf
Fehler. Dazu kommen einzeln die Regeln unten. `reportUnusedDisableDirectives`
meldet eine Ausnahme im Code, die nichts mehr abschaltet.

## Regeln

| Regel | Warum |
|---|---|
| `no-floating-promises`, `no-misused-promises`, `await-thenable`, `return-await` | Ein Promise, auf das niemand wartet, verliert seinen Fehler. Ein async-Zuhörer an einem Event von discord.js wirft ins Leere |
| `switch-exhaustiveness-check` | Ein neuer Wert einer Union fällt nicht still durch |
| `no-explicit-any`, `no-unsafe-type-assertion`, `no-non-null-assertion`, `no-unnecessary-type-assertion` | Typen werden geprüft, nicht behauptet. Eingaben von aussen gehen durch eine Prüfung |
| `only-throw-error`, `prefer-promise-reject-errors`, `use-unknown-in-catch-callback-variable`, `preserve-caught-error` | Fehler sind `Error`, mit `cause`; ein `catch` nimmt `unknown` |
| `no-deprecated` | Veraltete APIs von discord.js und Node fallen auf, bevor sie verschwinden |
| `consistent-type-imports`, `no-import-type-side-effects` | `import type`, passend zu `verbatimModuleSyntax` |
| `import/no-cycle`, `import/no-self-import`, `import/no-duplicates` | keine Kreise zwischen Dateien |
| `prefer-nullish-coalescing` | `??` statt `\|\|`. Bei Zeichenketten bleibt `\|\|` erlaubt: Ein leerer Wert, etwa aus der Umgebung, soll auf den Standard fallen |

## Moderne Sprachmittel

`bot/` baut für ES2025 (`target` in `bot/tsconfig.json`); er läuft nur auf
Node 24. `web/` baut für ES2024: Im Browser zählt, was die Besucher haben,
und `tsc` ergänzt keine fehlenden Funktionen. Beide nutzen
`verbatimModuleSyntax`.

Die Regeln verlangen, was diese Fassungen können:

| statt | nimm | Regel |
|---|---|---|
| `liste[liste.length - 1]` | `liste.at(-1)` | `unicorn/prefer-at` |
| `[...liste].sort()` | `liste.toSorted()` | `unicorn/no-array-sort` |
| `text.replace(/…/g, …)` | `text.replaceAll(/…/g, …)` | `unicorn/prefer-string-replace-all` |
| `JSON.parse(JSON.stringify(x))` | `structuredClone(x)` | `unicorn/prefer-structured-clone` |
| `import … from 'fs'` | `import … from 'node:fs'` | `unicorn/prefer-node-protocol` |
| `includes` auf einer festen Liste | `has` auf einem `Set` | `unicorn/prefer-set-has` |
| `window`, `self`, `global` | `globalThis` | `unicorn/prefer-global-this` |
| `void start()` am Ende eines Moduls | `await start()` | `unicorn/prefer-top-level-await` |
| `liste.forEach(…)` | `for (… of liste)` | `unicorn/no-array-for-each` |
| `Object.prototype.hasOwnProperty.call(o, k)` | `Object.hasOwn(o, k)` | `eslint/prefer-object-has-own` |
| `catch (e) {}` ohne `e` | `catch {}` | `unicorn/prefer-optional-catch-binding` |
| `throw new Error(text)` im `catch` | `throw new Error(text, { cause })` | `eslint/preserve-caught-error` |

Wo keine Regel greift, gilt dasselbe: `Promise.withResolvers` statt eines
Konstruktors, der seine Funktionen herausreicht; `Object.groupBy`; die
Methoden von `Set` wie `union` und `difference`; Iterator-Helfer wie
`werte.values().filter(…).toArray()`; `using` und `await using` für
Ressourcen mit `Symbol.dispose`. Node 24.21 kann alle diese, lokal geprüft
mit `node -e`.

## Tests

In `**/*.test.ts` und `bot/src/testhilfe.ts` gilt anders:

| Regel | dort |
|---|---|
| `no-floating-promises` | `test`, `describe`, `it` und `suite` aus `node:test` sind ausgenommen; ihr Promise wartet der Testrunner selbst ab. Jedes andere Promise im Test muss erwartet werden |
| `no-await-in-loop` | aus: Tests laufen bewusst Schritt für Schritt |
| `no-shadow`, `consistent-function-scoping` | aus: Hilfsfunktionen und Namen bleiben beim Test, der sie braucht |
| `no-underscore-dangle` | aus: Tests füllen den Cache von discord.js über `_add` |
| `no-unsafe-type-assertion`, `require-array-sort-compare` | aus: Tests prüfen die Form einer Antwort mit `assert`, nicht über den Typ |

## Altlasten

Was beim Einführen schon da war und nicht schnell geht, ist eine Warnung
statt eines Fehlers. `maxWarnings` ist die Zahl dieser Warnungen; eine
neue Warnung lässt die Prüfung scheitern.

Stand 2026-10-12:

- Casts und `!` sind in beiden Paketen Fehler. Keine Datei steht mehr
  unter `overrides`, um sie zur Warnung zu machen.
- Im Bot bleiben die 2 Grenzverletzungen in `bot/src/api/` aus
  [Struktur von Bot und Oberfläche](struktur.md), „Was noch fehlt“;
  `maxWarnings` ist dort 2. In `web/` ist es 0.

Eingaben von aussen prüfen Typwächter statt `as`. Im Bot sind das
`istObjekt` und `ohneNul` in `bot/src/kern/eingabe.ts`; `pruefe` der
Begrüssung und der Sprachräume baut den Wert aus geprüften Feldern. Die
Antworten der API prüft `web/src/api/klient.ts` mit Typprädikaten, siehe
[Dashboard](../frontend/dashboard.md), „Antworten prüfen“.

Wer eine Grenzverletzung beseitigt, senkt `maxWarnings` um ihre Zahl.

## Eine Regel abschalten

Nur für eine Zeile oder einen Block, mit dem Grund im Kommentar davor:

```ts
// Eine Datei nach der anderen, in der Reihenfolge der Namen.
/* oxlint-disable no-await-in-loop */
for (const name of neu) {
  …
}
/* oxlint-enable no-await-in-loop */
```
