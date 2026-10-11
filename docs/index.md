---
title: Wegweiser
description: Jede Seite der Doku mit einer Zeile, nach Themen geordnet, dazu die Entscheidungen.
code: []
---

# Wegweiser

Das Wissen des Projekts: wie Bot und Weboberfläche arbeiten, wie eine
Änderung auf `main` kommt, was entschieden ist. Die Regeln stehen in
[`AGENTS.md`](../AGENTS.md), die Workflows in [`skills/`](../skills/). Zu
einer Datei findet `git grep -l "<pfad>" docs/` ihre Seiten.

## Benutzung

- [Einrichtung und Betrieb](benutzung/einrichtung.md): Bot im Developer Portal, `DISCORD_BOT_TOKEN` lokal und als GitHub-Secret, bauen, starten, einladen, Dienst.
- [Befehle](benutzung/befehle.md): jeder Slash-Befehl mit Antwort, Sichtbarkeit, Rechten und Intents.

## Bot

- [Intents](bot/intents.md): nur `Guilds`, welche privilegierten nicht und warum.
- [Rate-Limits](bot/rate-limits.md): Befehle registrieren, 429, 5xx, Zeitlimit.
- [Wiederanlauf](bot/wiederanlauf.md): Neuverbinden durch discord.js, Codes, nach denen der Bot endet, was nicht getestet ist.
- [Datenschutz](bot/datenschutz.md): was der Bot speichert, was ins Log geht.
- [Datenbank](bot/datenbank.md): PostgreSQL über `pg`, Verbindung, Discord-IDs als `bigint`, Pool und seine Werte, Migrationen unter Sperre und in Transaktionen, Dev-Datenbank in Docker, was noch fehlt.
- [Cache](bot/cache.md): wann cachen und wann nicht, `ladeCache`, Standardwerte, Invalidierung, Grenzen.

## Oberfläche

- [Design der Oberfläche](frontend/design.md): harte Regeln, Tokens, Schrift, Breakpoints, welches Element des Guides wofür steht, Herkunft der Regeln, Bewegung.
- [Auslieferung der Oberfläche](frontend/auslieferung.md): statisch mit `tsc`, `serve.mjs`, Header und CSP.

## Entwicklung

- [CI und Ablauf einer PR](entwicklung/ci.md): Ruleset von `main`, „Basis aktuell“, Rebase, die Prüfung der Doku, Backend, Frontend mit Lighthouse, Lizenzen.
- [Tests](entwicklung/tests.md): `node --test`, die gemockte Discord-API, was abgedeckt ist, Tests gegen PostgreSQL.

## Entscheidungen

- [0001: Nur PRs mit aktueller Basis auf main](entscheidungen/0001-nur-prs-mit-aktueller-basis.md): Ruleset ohne Ausnahme, Check im Modus strict, keine Pflicht-Freigabe.
- [0002: Der Bot in TypeScript mit discord.js](entscheidungen/0002-typescript-mit-discord-js.md): Node 24, discord.js als einzige Laufzeit-Abhängigkeit, `--env-file` statt dotenv; teilweise abgelöst durch 0006 und 0007.
- [0003: Nur tsc und node:test als Werkzeuge](entscheidungen/0003-tsc-und-node-test.md): `tsc` als Lint, kein ESLint, Prettier, Jest oder Vitest; teilweise abgelöst durch 0007.
- [0004: Die Oberfläche ohne Bundler](entscheidungen/0004-frontend-ohne-bundler.md): statisches HTML mit `tsc`, eigener kleiner Server für die Header, Vite erst bei Paketen.
- [0005: MariaDB über mysql2 mit eingebautem Pool](entscheidungen/0005-mysql2-mit-eingebautem-pool.md): `mysql2` statt des LGPL-Connectors, kein eigenes Pool-Paket, kein ORM. Abgelöst durch 0007.
- [0006: lru-cache als Cache](entscheidungen/0006-lru-cache.md): Grösse, Ablaufzeit, Laden bei Bedarf; keine eigene Map, kein Redis.
- [0007: PostgreSQL über pg mit eingebautem Pool](entscheidungen/0007-postgres-mit-pg.md): PostgreSQL 18 als einzige Datenbank, `pg` statt `postgres` oder ORM, Migrationen je in einer Transaktion unter `pg_advisory_lock`.
