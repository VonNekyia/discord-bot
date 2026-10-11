---
title: Datenschutz
description: Welche Daten von Discord der Bot speichert, wie lange, und was ins Log geht.
code:
  - bot/src/befehle.ts
  - bot/src/index.ts
  - bot/src/cache.ts
  - bot/src/datenbank.ts
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

Die Datenbank hält heute nur die Tabelle `migrationen` mit den Namen der
angewendeten Dateien. Der Cache von discord.js und der eigene Cache
(`bot/src/cache.ts`) liegen nur im Speicher und enden mit dem Prozess.
Kommen Daten über Nutzer in einen Cache, steht hier auch seine
Ablaufzeit.

## Was ins Log geht

Nur der Name des Befehls und der Text eines Fehlers (`text` in
`bot/src/befehle.ts`), nie das Fehlerobjekt: Fehler der REST-API tragen in
`url` den Token der Interaktion. Nie IDs, Namen, Nachrichteninhalte oder
Tokens. Der Test „ein unbekannter Befehl bekommt eine Meldung, das Log
keine Nutzerdaten“ prüft die Zeile.

Fehler der Datenbank gehen ebenso nur mit ihrer Meldung ins Log, auch
`Datenbank: <Meldung>` aus dem Pool, siehe [Datenbank](datenbank.md),
„Pool“. PostgreSQL legt die Werte einer Zeile, etwa bei einem doppelten
Schlüssel, in `detail` ab, nicht in die Meldung; `detail` geht nie ins
Log. Eine falsche Eingabe kann die Meldung aber nennen, etwa
`invalid input syntax for type bigint: "…"`. Eingaben von Nutzern darum
prüfen, bevor sie in eine Anfrage gehen.
