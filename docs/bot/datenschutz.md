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
speichert nur, was unten steht, und schreibt nichts davon ins Log. Wer
etwas speichern will, trägt es vorher hier ein: was, wozu, wie lange, wie
es gelöscht wird. Zeilen mit „kommt mit dem Dashboard“ sind beschlossen,
aber noch nicht gebaut.

## Was der Bot speichert

| Daten | Wozu | Wie lange | Stand |
|---|---|---|---|
| Sitzung: SHA-256 der Kennung, Discord-ID, Name, Avatar-Hash, IDs der Server mit „Server verwalten“, Ablaufdatum | Anmeldung am Dashboard, Liste der Server | 7 Tage ab Anmeldung; Abmelden löscht sofort, abgelaufene löscht der Bot spätestens nach einem Tag | kommt mit dem Dashboard |
| Begrüssung je Server und Art: Server-ID, Kanal-ID, Schalter, Texte | Nachricht bei Beitritt und Abschied | bis das Team sie ändert oder der Bot den Server verlässt | kommt mit dem Dashboard |
| Bild je Server und Art, so wie hochgeladen; es kann Personen zeigen | Hintergrund des Banners | bis es ersetzt oder gelöscht wird oder der Bot den Server verlässt | kommt mit dem Dashboard |

Nicht gespeichert werden:

- Der Access Token von Discord. Der Bot widerruft ihn gleich nach der
  Anmeldung, siehe [Anmeldung am Dashboard](../schnittstelle/anmeldung.md),
  „Ablauf“.
- Name und Avatar eines Mitglieds, das beitritt oder geht. Sie liegen nur
  für die eine Nachricht im Speicher.

Die Datenbank hält heute nur die Tabelle `migrationen` mit den Namen der
angewendeten Dateien. Der Cache von discord.js und der eigene Cache
(`bot/src/cache.ts`) liegen nur im Speicher und enden mit dem Prozess. Mit
dem Intent `GuildMembers` hält discord.js Mitglieder mit Name, Spitzname
und Rollen im Cache. Das Backend begrenzt diesen Cache in `makeCache` auf
höchstens 100 Mitglieder je Server, das Mitglied des Bots selbst immer;
das älteste fällt zuerst heraus. Die Rechte prüft der Bot ohnehin an der
REST-API, nicht im Cache, siehe [Anmeldung am Dashboard](../schnittstelle/anmeldung.md),
„Rechte“.

## Was ins Log geht

Nur der Name des Befehls und der Text eines Fehlers (`text` in
`bot/src/befehle.ts`), nie das Fehlerobjekt: Fehler der REST-API tragen in
`url` den Token der Interaktion. Nie IDs, Namen, Nachrichteninhalte,
Tokens, Cookies oder der Code der Anmeldung. Der Test „ein unbekannter Befehl bekommt eine Meldung, das Log
keine Nutzerdaten“ prüft die Zeile.

Fehler der Datenbank gehen ebenso nur mit ihrer Meldung ins Log, auch
`Datenbank: <Meldung>` aus dem Pool, siehe [Datenbank](datenbank.md),
„Pool“. PostgreSQL legt die Werte einer Zeile, etwa bei einem doppelten
Schlüssel, in `detail` ab, nicht in die Meldung; `detail` geht nie ins
Log. Eine falsche Eingabe kann die Meldung aber nennen, etwa
`invalid input syntax for type bigint: "…"`. Eingaben von Nutzern darum
prüfen, bevor sie in eine Anfrage gehen.
