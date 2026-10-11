---
title: "0003: Nur tsc und node:test als Werkzeuge"
description: Warum tsc zugleich Build und Lint ist und die Tests mit dem Testrunner von Node laufen, ohne ESLint, Prettier, Jest oder Vitest.
status: gilt
date: 2026-10-10
issues: []
code:
  - bot/tsconfig.json
  - bot/package.json
---

# 0003: Nur tsc und node:test als Werkzeuge

Teilweise abgelöst durch [0007](0007-postgres-mit-pg.md): Zu den
Dev-Abhängigkeiten kommt `@types/pg`.

## Anlass

Die CI soll bauen, prüfen und testen, ohne Abhängigkeit ohne Not
(`AGENTS.md`, Regel 23).

## Entscheidung

`tsc` baut und ist der Lint: `strict`, `noUnusedLocals`,
`noUnusedParameters`, `noImplicitReturns`, `noFallthroughCasesInSwitch`,
`noUncheckedIndexedAccess` in `bot/tsconfig.json`. Die Tests laufen mit
`node --test` und `node:assert`. Dev-Abhängigkeiten sind nur `typescript`
und `@types/node`.

## Verworfene Alternativen

- **ESLint.** Viele Pakete mehr. Was es hier fände, findet `tsc` mit den
  Schaltern oben zum grossen Teil auch.
- **Prettier.** Die Dateien sind klein, das Review sieht den Stil.
- **Jest oder Vitest.** `node:test` kann Tests, Mocks (`t.mock.method`)
  und Aufräumen (`t.after`) selbst.

## Folgen

- Keine automatische Formatierung. Kommt Streit über Stil auf, ist
  Prettier die erste Wahl, mit einer neuen Entscheidung.
- Die Tests laufen gegen das gebaute JavaScript in `bot/dist/`.
