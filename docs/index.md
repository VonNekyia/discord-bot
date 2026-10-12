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
- [Begrüssung bei Beitritt und Abschied](benutzung/begruessung.md): Platzhalter, Banner aus einem eigenen Bild, Standardwerte, Rechte, der Intent `GuildMembers`, die Bremse bei vielen Beitritten.
- [Sprachräume](benutzung/sprachraeume.md): Räume auf Zeit über Erzeuger, Namensvorlage, Menü mit Knöpfen im Textchat des Raums, Grenzen, Rechte und der Intent `GuildVoiceStates`.

## Schnittstelle

- [API des Dashboards](schnittstelle/api.md): Grundregeln, die allgemeinen Routen unter `/api/`, `Ich` und `Server`, Grenzen je Sitzung, Fehlercodes, die Weiterleitung von `serve.mjs`.
- [Baukasten des Dashboards](schnittstelle/baukasten.md): Seiten aus Bausteinen, die die Module anmelden; Routen unter `…/seiten`, Typen, jede Art von Baustein, Länge eines Texts, was die Oberfläche prüft, Fehler am Feld, ein Modul anmelden.
- [Anmeldung am Dashboard](schnittstelle/anmeldung.md): Discord-Login mit OAuth2, Sitzung und Cookie, Rechte, Origin, Umgebungsvariablen.
- [API der Begrüssung](schnittstelle/begruessung.md): die Seiten Beitritt und Abschied, ihre Bausteine, Optionen des Kanals, Einstellung speichern, Bild und Vorschau, Testnachricht mit Grenze je Server.
- [API der Sprachräume](schnittstelle/sprachraeume.md): die Seite Sprachräume, ihre Bausteine, Sprachkanäle und Kategorien mit `bereit`, Sprachräume einstellen, Codes.
- [API der Debug-Seite](schnittstelle/debug.md): Anfragen an Discord je Route, 429, ungültige Anfragen, eigene Grenzen; eine feste Ansicht ausserhalb des Baukastens, nur für Eigentümer und Team der Anwendung, nie IDs oder Tokens.

## Bot

- [Intents](bot/intents.md): heute nur `Guilds`, `GuildMembers` und `Partials.GuildMember` kommen mit der Begrüssung, welche privilegierten nicht und warum, Reihenfolge bei einem neuen privilegierten Intent.
- [Rate-Limits](bot/rate-limits.md): Befehle registrieren, 429, Kanäle ändern ohne Warten, Anmeldung mit Frist, Anfragen und 429 zählen und loggen, ungültige Anfragen mit Warnung, eigene Grenzen, 5xx.
- [Wiederanlauf](bot/wiederanlauf.md): Neuverbinden durch discord.js, Codes, nach denen der Bot endet, was nicht getestet ist.
- [Datenschutz](bot/datenschutz.md): was der Bot speichert, was ins Log geht.
- [Datenbank](bot/datenbank.md): PostgreSQL über `pg`, Verbindung, Discord-IDs als `bigint`, Pool und seine Werte, Migrationen unter Sperre und in Transaktionen, Dev-Datenbank in Docker, was noch fehlt.
- [API im Bot](bot/dashboard-api.md): wie das Backend die API des Dashboards baut, Module, Start und Ende, Reihenfolge der Prüfungen, Grenzen und Zeitlimits, die Debug-Route mit den Berechtigten, Aufräumen.
- [Begrüssung senden](bot/begruessung-senden.md): wie der Bot bei Beitritt und Abschied sendet, Cache, Rechte im Kanal, Platzhalter, Erwähnungen, Banner, Log.
- [Sprachräume im Bot](bot/sprachraeume-bau.md): wie das Backend die Sprachräume baut, Belegung aus den Voice States, Anlegen in einem Aufruf mit dem Menü danach, nacheinander je Mitglied, erwartete Fehler, Löschen nach 2 s, Abgleich beim Start.
- [Menü der Sprachräume im Bot](bot/sprachraeume-menue.md): Knöpfe und `custom_id`, Antworten mit `deferReply`, eins nach dem anderen je Raum, Rechte im Raum für Sperren, Verstecken und Bann, Besitzer wechseln, erwartete Fehler, Log.
- [Cache](bot/cache.md): wann cachen und wann nicht, `ladeCache`, Standardwerte, Invalidierung, Grenzen.

## Oberfläche

- [Design der Oberfläche](frontend/design.md): harte Regeln, Tokens, Schrift, Breakpoints, welches Element des Guides wofür steht, Herkunft der Regeln, Bewegung.
- [Auslieferung der Oberfläche](frontend/auslieferung.md): statisch mit `tsc`, `serve.mjs` mit Weiterleitung von `/api/`, Header und CSP.
- [Dashboard](frontend/dashboard.md): Zustände, Anmelden, Abmelden, Tabs aus den Seiten des Bots, wie eine Seite aus Bausteinen entsteht, Bausteine im Code, Speichern, Bild, Aktion, Vorschau, die Debug-Ansicht, Prüfen vor dem Senden, Meldungen.

## Entwicklung

- [CI und Ablauf einer PR](entwicklung/ci.md): Ruleset von `main`, „Basis aktuell“, Rebase, die Prüfung der Doku, Backend, Frontend mit Lighthouse, Header, Lizenzen als SPDX-Ausdruck, Actions und Images fest an SHA und Digest.
- [Struktur von Bot und Oberfläche](entwicklung/struktur.md): Schichten `kern/`, `discord/`, `api/` und Feature-Module im Bot, Bausteine und Seite in der Oberfläche, wer wen importieren darf, was ein Modul bündelt, die eigene Schicht über discord.js, was vom Umbau noch fehlt.
- [Lint mit oxlint](entwicklung/lint.md): `npm run lint`, die Regeln und warum, moderne Sprachmittel mit ES2025 im Bot und ES2024 im Web, Tests, Altlasten mit `maxWarnings`, eine Regel begründet abschalten.
- [Updates mit Renovate](entwicklung/renovate.md): was Renovate wann aktualisiert, Automerge für Minor, Patch und Digest, Bewertung durch den Orchestrator, Konflikte, Labels, Einrichten.
- [Tests](entwicklung/tests.md): `node --test`, die gemockte Discord-API, was abgedeckt ist, Tests gegen PostgreSQL.

## Entscheidungen

- [0001: Nur PRs mit aktueller Basis auf main](entscheidungen/0001-nur-prs-mit-aktueller-basis.md): Ruleset ohne Ausnahme, Check im Modus strict, keine Pflicht-Freigabe.
- [0002: Der Bot in TypeScript mit discord.js](entscheidungen/0002-typescript-mit-discord-js.md): Node 24, discord.js als einzige Laufzeit-Abhängigkeit, `--env-file` statt dotenv; teilweise abgelöst durch 0006 und 0007.
- [0003: Nur tsc und node:test als Werkzeuge](entscheidungen/0003-tsc-und-node-test.md): `tsc` als Lint, kein ESLint, Prettier, Jest oder Vitest; teilweise abgelöst durch 0007 und 0014.
- [0004: Die Oberfläche ohne Bundler](entscheidungen/0004-frontend-ohne-bundler.md): statisches HTML mit `tsc`, eigener kleiner Server für die Header, Vite erst bei Paketen.
- [0005: MariaDB über mysql2 mit eingebautem Pool](entscheidungen/0005-mysql2-mit-eingebautem-pool.md): `mysql2` statt des LGPL-Connectors, kein eigenes Pool-Paket, kein ORM. Abgelöst durch 0007.
- [0006: lru-cache als Cache](entscheidungen/0006-lru-cache.md): Grösse, Ablaufzeit, Laden bei Bedarf; keine eigene Map, kein Redis.
- [0007: PostgreSQL über pg mit eingebautem Pool](entscheidungen/0007-postgres-mit-pg.md): PostgreSQL 18 als einzige Datenbank, `pg` statt `postgres` oder ORM, Migrationen je in einer Transaktion unter `pg_advisory_lock`.
- [0008: Die API des Dashboards im Prozess des Bots](entscheidungen/0008-api-im-bot-prozess.md): `node:http` im Bot, ein Origin mit der Oberfläche, Sitzung in PostgreSQL; kein eigener Server, kein Framework, kein Token im Browser.
- [0009: Banner mit @napi-rs/canvas und Inter](entscheidungen/0009-banner-mit-napi-rs-canvas.md): `@napi-rs/canvas` 1.0.10 gepinnt, Lizenzen aus der SBOM, WebP für Bilder, Inter als Schrift; kein sharp, kein node-canvas; teilweise abgelöst durch 0010.
- [0010: Ersatzschriften im Banner für Emoji und CJK](entscheidungen/0010-ersatzschriften-im-banner.md): Noto Color Emoji als COLRv1 und Noto Sans CJK JP Bold hinter Inter, 22 MB; keine Teilmengen, keine einfarbigen Emoji.
- [0011: Sprachräume mit Knöpfen statt Befehlen](entscheidungen/0011-sprachraeume-mit-knoepfen.md): Erzeuger, ein Menü im Textchat jedes Raums, Zustand in den Rechten des Kanals, nur der Besitzer in PostgreSQL; keine Slash-Befehle, kein gemeinsamer Menü-Kanal.
- [0012: Actions und Images in der CI fest an Commit und Digest](entscheidungen/0012-actions-und-images-fest.md): voller Commit-SHA je Action, Digest für PostgreSQL, `persist-credentials: false`; keine Tags; teilweise abgelöst durch 0013.
- [0013: Updates mit Renovate](entscheidungen/0013-renovate.md): Renovate als GitHub-App, wöchentlich, npm erst nach 3 Tagen; Automerge für Minor, Patch und Digest stabiler Pakete, alles andere bewertet der Orchestrator, ein Konflikt wird ein Issue für den Maintainer; nicht Dependabot, kein Automerge für Hauptversionen.
- [0014: oxlint als Linter, moderne Sprachmittel](entscheidungen/0014-oxlint-und-moderne-sprachmittel.md): oxlint mit typbasierten Regeln über TypeScript 7, Altlasten als Warnung mit Obergrenze, ES2025 im Bot, ES2024 im Web; kein ESLint, kein Biome.
- [0015: Feature-Module und eigene Schichten](entscheidungen/0015-feature-module-und-schichten.md): ein Ordner je Feature-Suite, nur `discord/` spricht mit discord.js, nur `web/src/api/` mit dem Bot, Grenzen per Lint, Umbau in Stufen; nicht nach Art ordnen, keine Workspaces; teilweise abgelöst durch 0017.
- [0016: Debug-Seite im Speicher, nur für den Eigentümer](entscheidungen/0016-debug-im-speicher-fuer-den-eigentuemer.md): Zahlen seit dem Start nur im Speicher, Zugriff für Eigentümer und Team der Anwendung, Anmeldung über `@discordjs/rest`, Warnung ab 1000 ungültigen Anfragen in 10 min; nicht für jeden mit „Server verwalten“, nicht in PostgreSQL.
- [0017: Das Dashboard als Baukasten](entscheidungen/0017-dashboard-als-baukasten.md): Module melden Seiten aus Bausteinen an, die Oberfläche baut jede Art allgemein, Regeln über mehrere Felder nur im Bot; kein Formular je Modul, kein Schema-Standard, kein HTML vom Bot.
