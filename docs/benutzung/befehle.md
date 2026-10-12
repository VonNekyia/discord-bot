---
title: Befehle
description: Jeder Slash-Befehl mit Antwort, Sichtbarkeit und den Rechten, die er braucht; was das Modul beschreibt und was die Discord-Schicht tut; Antwortzeit und Fehler.
code:
  - bot/src/module/befehle/befehle.ts
  - bot/src/discord/befehle.ts
  - bot/src/kern/datenbank.ts
---

# Befehle

Alle Befehle sind globale Slash-Befehle und stehen in `befehle` in
`bot/src/module/befehle/befehle.ts`. Ein neuer Befehl kommt mit dem Skill
[`befehl-hinzufuegen`](../../skills/befehl-hinzufuegen/SKILL.md).

| Befehl | Antwort | Sichtbar für | Rechte des Bots | Intents |
|---|---|---|---|---|
| `/ping` | `Pong. Datenbank: <n> ms.`, oder `nicht erreichbar` | nur den Nutzer (ephemeral) | keine | `Guilds` |

## Aufbau

Das Modul kennt kein discord.js. Ein Befehl ist ein `Befehl` aus
`bot/src/discord/befehle.ts`: `name`, `beschreibung` und
`ausfuehren(aufruf)`. Optionen hat noch kein Befehl; sie kommen mit dem
ersten, der welche braucht. Den Rest macht die Discord-Schicht:

| Was | wo |
|---|---|
| beim Start alle registrieren | `registriere`, siehe [Rate-Limits](../bot/rate-limits.md), „Befehle registrieren“ |
| den Befehl zum Namen finden und ausführen | `beantworte`, aus `bot/src/index.ts` bei jedem Slash-Befehl |
| antworten | `Aufruf#antworte`: gleich, nur für den Nutzer (ephemeral), ohne Erwähnungen; scheitert es, wirft es `DiscordFehler` |
| Fehler | `beantworte` fängt sie, siehe „Fehler“ |

## Antwortzeit

Discord erwartet die erste Antwort auf eine Interaktion innerhalb von 3 s,
sonst sieht der Nutzer „Die Anwendung reagiert nicht“, siehe die
[Doku von Discord](https://discord.com/developers/docs/interactions/receiving-and-responding#responding-to-an-interaction).
`/ping` wartet darum höchstens 2 s auf die Datenbank (`misse` in
`bot/src/kern/datenbank.ts`, `frist`) und antwortet dann „nicht erreichbar“. Ein
Befehl, der länger braucht, muss die Antwort aufschieben; dafür bekommt
`Aufruf` zuerst ein `warte`, wie `Druck` in `bot/src/discord/interaktionen.ts`.

## Fehler

Schlägt ein Befehl fehl oder ist er unbekannt, sieht der Nutzer
„Das hat nicht geklappt.“, nur für ihn. Hat der Befehl schon geantwortet,
kommt die Meldung als zweite Nachricht (`followUp`). Scheitert auch sie,
steht `/<befehl>: Antwort fehlgeschlagen: <Fehler>` im Log. Was ins Log geht, steht in
[Datenschutz](../bot/datenschutz.md), „Was ins Log geht“.
