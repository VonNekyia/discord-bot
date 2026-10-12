---
title: Befehle
description: Jeder Slash-Befehl mit Antwort, Sichtbarkeit und den Rechten, die er braucht.
code:
  - bot/src/module/befehle/befehle.ts
  - bot/src/kern/datenbank.ts
---

# Befehle

Alle Befehle sind globale Slash-Befehle und stehen in `befehle` in
`bot/src/module/befehle/befehle.ts`. Ein neuer Befehl kommt mit dem Skill
[`befehl-hinzufuegen`](../../skills/befehl-hinzufuegen/SKILL.md).

| Befehl | Antwort | Sichtbar für | Rechte des Bots | Intents |
|---|---|---|---|---|
| `/ping` | `Pong. Datenbank: <n> ms.`, oder `nicht erreichbar` | nur den Nutzer (ephemeral) | keine | `Guilds` |

## Antwortzeit

Discord erwartet die erste Antwort auf eine Interaktion innerhalb von 3 s,
sonst sieht der Nutzer „Die Anwendung reagiert nicht“, siehe die
[Doku von Discord](https://discord.com/developers/docs/interactions/receiving-and-responding#responding-to-an-interaction).
`/ping` wartet darum höchstens 2 s auf die Datenbank (`misse` in
`bot/src/kern/datenbank.ts`, `frist`) und antwortet dann „nicht erreichbar“. Ein
Befehl, der länger braucht, ruft zuerst `deferReply` auf.

## Fehler

Schlägt ein Befehl fehl oder ist er unbekannt, sieht der Nutzer
„Das hat nicht geklappt.“, nur für ihn. Was ins Log geht, steht in
[Datenschutz](../bot/datenschutz.md), „Was ins Log geht“.
