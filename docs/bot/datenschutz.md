---
title: Datenschutz
description: Welche Daten von Discord der Bot speichert, wie lange, und was ins Log geht.
code:
  - bot/src/befehle.ts
  - bot/src/index.ts
---

# Datenschutz

IDs, Namen und Nachrichten von Discord sind personenbezogen. Der Bot
speichert heute nichts davon und schreibt nichts davon ins Log. Wer etwas
speichern will, trägt es vorher hier ein: was, wozu, wie lange, wie es
gelöscht wird.

## Was der Bot speichert

| Daten | Wozu | Wie lange |
|---|---|---|
| keine | – | – |

Der Cache von discord.js liegt nur im Speicher und endet mit dem Prozess.

## Was ins Log geht

Nur der Name des Befehls und der Text eines Fehlers (`text` in
`bot/src/befehle.ts`), nie das Fehlerobjekt: Fehler der REST-API tragen in
`url` den Token der Interaktion. Nie IDs, Namen, Nachrichteninhalte oder
Tokens. Der Test „ein unbekannter Befehl bekommt eine Meldung, das Log
keine Nutzerdaten“ prüft die Zeile.
