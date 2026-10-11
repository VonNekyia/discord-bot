---
title: Datenschutz
description: Welche Daten von Discord der Bot speichert, wie lange, und was ins Log geht.
code:
  - bot/src/befehle.ts
  - bot/src/index.ts
  - bot/src/cache.ts
  - bot/src/datenbank.ts
  - bot/src/client.ts
  - bot/src/api.ts
  - bot/src/anmeldung.ts
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
| Sitzung: SHA-256 der Kennung, Discord-ID, Name, Avatar-Hash, IDs der Server mit „Server verwalten“, Ablaufdatum | Anmeldung am Dashboard, Liste der Server | 7 Tage ab Anmeldung; Abmelden löscht sofort, abgelaufene löscht der Bot spätestens nach einem Tag | gebaut |
| Begrüssung je Server und Art: Server-ID, Kanal-ID, Schalter, Texte | Nachricht bei Beitritt und Abschied | bis das Team sie ändert oder der Bot den Server verlässt | gebaut |
| Bild je Server und Art, beim Hochladen auf 1100 × 440 px zugeschnitten und neu kodiert, ohne Metadaten wie EXIF oder GPS; es kann Personen zeigen | Hintergrund des Banners | bis es ersetzt oder gelöscht wird oder der Bot den Server verlässt | kommt mit dem Dashboard |

„Der Bot verlässt den Server“ heisst auch: Er wurde entfernt, während er
aus war. Beim Start gleicht er ab und löscht dann, siehe
[Begrüssung bei Beitritt und Abschied](../benutzung/begruessung.md),
„Wenn etwas fehlt“.

Nicht gespeichert werden:

- Der Access Token von Discord. Der Bot widerruft ihn gleich nach der
  Anmeldung, siehe [Anmeldung am Dashboard](../schnittstelle/anmeldung.md),
  „Ablauf“.
- Name und Avatar eines Mitglieds, das beitritt oder geht. Sie kommen in
  keine Tabelle; im Speicher hält sie nur der begrenzte Cache unten.

Welche Tabelle was hält, steht in [Datenbank](datenbank.md), „Tabellen“.
Der Cache von discord.js und der eigene Cache
(`bot/src/cache.ts`) liegen nur im Speicher und enden mit dem Prozess.

discord.js legt jedes Mitglied, das es sieht, mit Spitzname und Rollen im
Cache der Mitglieder ab und dessen Nutzer mit Name und Avatar im Cache der
Nutzer (`GuildMember#_patch`): bei jeder Interaktion, bei jeder Prüfung der
Rechte und mit dem Intent `GuildMembers` bei jedem Beitritt. Ohne Grenze
blieben sie bis zum Ende des Prozesses. Darum hält `erstelleClient` in
`bot/src/client.ts` in beiden Caches, `GuildMemberManager` und
`UserManager`, nur den Bot selbst (`maxSize` 0, `keepOverLimit`). Der Test
„der Cache hält Mitglieder und Nutzer nur für den Bot selbst“ prüft das.
Die Rechte prüft der Bot ohnehin an der REST-API, nicht im Cache, siehe
[Anmeldung am Dashboard](../schnittstelle/anmeldung.md), „Rechte“.

## Was ins Log geht

Nur der Name des Befehls und der Text eines Fehlers (`text` in
`bot/src/befehle.ts`), nie das Fehlerobjekt: Fehler der REST-API tragen in
`url` den Token der Interaktion. Nie IDs, Namen, Nachrichteninhalte,
Tokens, Cookies oder der Code der Anmeldung. Der Test „ein unbekannter
Befehl bekommt eine Meldung, das Log keine Nutzerdaten“ prüft die Zeile.

Die API loggt nur den Schritt der Anmeldung oder den Namen der Route
und den Text des Fehlers: `Anmeldung: <Schritt>: <Fehler>` und
`API <Route>: <Fehler>`. Der Name der Route ist fest, etwa `kanaele`, nie
der Pfad; der trägt die ID des Servers. Der Test „kein Code, Token, Cookie,
state und keine ID im Log“ prüft das.

Fehler der Datenbank gehen ebenso nur mit ihrer Meldung ins Log, auch
`Datenbank: <Meldung>` aus dem Pool, siehe [Datenbank](datenbank.md),
„Pool“. PostgreSQL legt die Werte einer Zeile, etwa bei einem doppelten
Schlüssel, in `detail` ab, nicht in die Meldung; `detail` geht nie ins
Log. Eine falsche Eingabe kann die Meldung aber nennen, etwa
`invalid input syntax for type bigint: "…"`. Eingaben von Nutzern darum
prüfen, bevor sie in eine Anfrage gehen.
