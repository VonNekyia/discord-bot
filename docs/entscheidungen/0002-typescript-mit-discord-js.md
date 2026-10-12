---
title: "0002: Der Bot in TypeScript mit discord.js"
description: Warum der Bot in TypeScript auf Node 24 mit discord.js 14 als einziger Laufzeit-Abhängigkeit läuft.
status: gilt
date: 2026-10-10
issues: []
code:
  - bot/package.json
---

# 0002: Der Bot in TypeScript mit discord.js

Teilweise abgelöst durch [0006](0006-lru-cache.md) und
[0007](0007-postgres-mit-pg.md): Zur Laufzeit kommen `lru-cache` und `pg`
dazu.

## Anlass

Der Maintainer gibt TypeScript und discord.js vor. Offen war, was dazu
kommt.

## Entscheidung

Node 24 LTS, TypeScript, discord.js 14 als einzige Laufzeit-Abhängigkeit.
Rate-Limits, Wiederanlauf und Cache übernimmt discord.js. Secrets liest
Node selbst mit `--env-file`.

## Verworfene Alternativen

- **dotenv.** `node --env-file` kann dasselbe seit Node 20.6.
- **Ein Framework über discord.js** für Befehle. Bei einem Befehl reicht
  die Liste `befehle` in `bot/src/module/befehle/befehle.ts`.
- **Eine eigene Schicht über der REST-API.** `@discordjs/rest` hält die
  Limits schon ein, siehe [Rate-Limits](../bot/rate-limits.md).

## Folgen

- discord.js bringt 13 direkte Abhängigkeiten mit, darunter `undici` und
  `@discordjs/ws`. Die CI prüft ihre Lizenzen und Lücken.
- Ein Wechsel der Hauptversion von discord.js ist ein eigener PR mit
  Blick auf `@discordjs/rest` und die Codes in
  [Wiederanlauf](../bot/wiederanlauf.md).
