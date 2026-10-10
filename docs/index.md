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

- [Einrichtung und Betrieb](benutzung/einrichtung.md): Bot im Developer Portal, `DISCORD_TOKEN` lokal und als GitHub-Secret, bauen, starten, einladen, Dienst.
- [Befehle](benutzung/befehle.md): jeder Slash-Befehl mit Antwort, Sichtbarkeit, Rechten und Intents.

## Bot

- [Intents](bot/intents.md): nur `Guilds`, welche privilegierten nicht und warum.
- [Rate-Limits](bot/rate-limits.md): Befehle registrieren, 429, 5xx, Zeitlimit.
- [Wiederanlauf](bot/wiederanlauf.md): Neuverbinden durch discord.js, Codes, nach denen der Bot endet, was nicht getestet ist.
- [Datenschutz](bot/datenschutz.md): was der Bot speichert, was ins Log geht.

## Entwicklung

- [CI und Ablauf einer PR](entwicklung/ci.md): Ruleset von `main`, „Basis aktuell“, Rebase, die Prüfung der Doku, Backend, Lizenzen.
- [Tests](entwicklung/tests.md): `node --test`, die gemockte Discord-API, was abgedeckt ist.

## Entscheidungen

- [0001: Nur PRs mit aktueller Basis auf main](entscheidungen/0001-nur-prs-mit-aktueller-basis.md): Ruleset ohne Ausnahme, Check im Modus strict, keine Pflicht-Freigabe.
- [0002: Der Bot in TypeScript mit discord.js](entscheidungen/0002-typescript-mit-discord-js.md): Node 24, discord.js als einzige Laufzeit-Abhängigkeit, `--env-file` statt dotenv.
- [0003: Nur tsc und node:test als Werkzeuge](entscheidungen/0003-tsc-und-node-test.md): `tsc` als Lint, kein ESLint, Prettier, Jest oder Vitest.
