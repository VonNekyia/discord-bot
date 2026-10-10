---
title: Befehle
description: Jeder Slash-Befehl mit Antwort, Sichtbarkeit und den Rechten, die er braucht.
code:
  - bot/src/befehle.ts
---

# Befehle

Alle Befehle sind globale Slash-Befehle und stehen in `befehle` in
`bot/src/befehle.ts`. Ein neuer Befehl kommt mit dem Skill
[`befehl-hinzufuegen`](../../skills/befehl-hinzufuegen/SKILL.md).

| Befehl | Antwort | Sichtbar für | Rechte des Bots | Intents |
|---|---|---|---|---|
| `/ping` | `Pong. Datenbank: <n> ms.`, oder `nicht erreichbar` | nur den Nutzer (ephemeral) | keine | `Guilds` |

## Fehler

Schlägt ein Befehl fehl oder ist er unbekannt, sieht der Nutzer
„Das hat nicht geklappt.“, nur für ihn. Was ins Log geht, steht in
[Datenschutz](../bot/datenschutz.md), „Was ins Log geht“.
