---
title: Begrüssung senden
description: Wie der Bot bei Beitritt und Abschied sendet; Ereignisse und Partial, die Discord-Schicht mit Mitglied und Textkanal, Einstellungen aus dem Cache, die Bremse, höchstens zwei Banner zugleich, Prüfung der Rechte im Kanal, Platzhalter, Erwähnungen, die Testnachricht, was ins Log geht.
code:
  - bot/src/module/begruessung/senden.ts
  - bot/src/module/begruessung/begruessung.ts
  - bot/src/index.ts
  - bot/src/discord/nachrichten.ts
---

# Begrüssung senden

Was der Bot bei Beitritt und Abschied schickt, steht in
[Begrüssung bei Beitritt und Abschied](../benutzung/begruessung.md). Diese
Seite sagt, wie `begruesse` in `bot/src/module/begruessung/senden.ts` das tut. Es läuft bei
`guildMemberAdd` und `guildMemberRemove`; beide kommen nur mit dem Intent
`GuildMembers`, der Abschied für Mitglieder ausserhalb des Caches nur mit
`Partials.GuildMember`, siehe [Intents](intents.md).

## Discord-Schicht

Das Modul Begrüssung importiert kein discord.js. Was es von Discord
braucht, kommt aus `bot/src/discord/nachrichten.ts`, mit eigenen Typen,
siehe [Struktur von Bot und Oberfläche](../entwicklung/struktur.md), „Die
Discord-Schicht“:

| Funktion oder Typ | Inhalt |
|---|---|
| `Mitglied`, `alsMitglied` | ID, Anzeigename, URL des Avatars als PNG mit 256 px, Server mit ID, Name und Zahl der Mitglieder; auch aus einem Partial |
| `Textkanal`, `textkanal` | ein Text- oder Ankündigungskanal, in dem der Bot sehen und senden darf, mit `anhaengen` für „Dateien anhängen“; sonst `undefined` |
| `textkanalAuf` | dasselbe über die IDs von Server und Kanal, für Ereignisse und die Bremse |
| `Nachricht`, `Textkanal#sende` | Text, Datei, `pingt`; daraus `allowedMentions`, siehe „Platzhalter und Erwähnungen“ |
| `DiscordFehler` | was `sende` wirft: `kein_recht` (50001, 50013), `nicht_gefunden` (10003), `zu_schnell` (RateLimitError), sonst `anderes`; die Meldung bleibt die von Discord |

`bot/src/index.ts` wandelt jedes Mitglied aus `guildMemberAdd` und
`guildMemberRemove` mit `alsMitglied` und gibt `begruesse` den Kanal über
`textkanalAuf`. Die Seiten in `bot/src/module/begruessung/seiten.ts`
nehmen `alsMitglied` und `textkanal` für Vorschau und Testnachricht.

## Ablauf

1. Die Einstellungen des Servers kommen aus dem Cache `einstellungen`
   (`ladeCache` über `lese`), siehe [Cache](cache.md). Lassen sie sich
   nicht lesen, endet es mit einer Logzeile.
2. Ist die Art aus oder ohne Kanal, endet es still.
3. Die Bremse zählt das Ereignis, siehe „Bremse“. Greift sie, endet es.
4. Der Kanal muss ein Text- oder Ankündigungskanal sein, in dem der Bot
   sehen und senden darf (`textkanal`, siehe „Discord-Schicht“). Sonst
   endet es mit einer Logzeile.
5. Der Text bekommt die Platzhalter (`ersetze`, siehe unten).
6. Mit `banner` und gespeichertem Bild zeichnet `banner` das PNG. Fehlt im
   Kanal „Dateien anhängen“ oder scheitert das Zeichnen, geht nur der Text,
   mit einer Logzeile.
7. Ist der Text leer, nur aus Leerzeichen, und es gibt kein Banner, geht
   nichts.
8. `sende` mit Text, Datei `beitritt.png` oder `abschied.png` und `pingt`.
   Scheitert es, eine Logzeile mit der Meldung von Discord.

## Bremse

Was die Bremse tut, steht in
[Begrüssung bei Beitritt und Abschied](../benutzung/begruessung.md),
„Bremse“. Gebaut ist sie so:

- `Bremse` in `bot/src/module/begruessung/senden.ts` hält je Schlüssel `<Server>/<Art>` die
  ID des Servers, die
  Zeiten der letzten Ereignisse und die Zahl der gezählten. `zaehle` gibt
  `einzeln`, `an` (das erste gezählte) oder `gezaehlt` zurück.
- Ab dem ersten gezählten Ereignis läuft ein Timer über 30 s; jedes weitere
  setzt ihn neu. Läuft er ab, fällt der Schlüssel weg, und `loese` bekommt
  die Zahl.
- `erstelleBremse` verbindet `loese` mit `fasseZusammen`. Das liest die
  Einstellungen neu, sucht den Kanal neu über `textkanalAuf` und schickt
  die Zusammenfassung (`zusammenfassung`) nur, wenn die Art noch an ist
  und der Bot im Kanal darf, ohne Ping und ohne Banner. In den 30 s können
  sich Einstellung und Rechte ändern; fehlt der Kanal dann, steht eine
  Logzeile da, und nichts wirft.
- `bot/src/index.ts` legt eine Bremse für alle Server an. Sie lebt im
  Speicher; ein Neustart vergisst sie.

### Höchstens zwei Banner zugleich

`banner` zeichnet über `Plaetze(2)`: Laufen schon zwei, wartet jedes
weitere, bis eins fertig ist, in der Reihenfolge, in der es kam. Das gilt
für das Senden, die Testnachricht und die Vorschau zusammen. So kostet ein
Raid, der unter der Schwelle der Bremse bleibt, höchstens zwei Banner
Rechenzeit gleichzeitig.

## Platzhalter und Erwähnungen

`ersetze` in `bot/src/module/begruessung/begruessung.ts` ersetzt in einem Durchgang; ein
eingesetzter Wert wird nicht noch einmal ersetzt. Im Text setzt
`maskiere` vor jedes ASCII-Satzzeichen in Namen einen Backslash. Discord
liest danach nichts davon als Markdown, als Erwähnung (`<@…>`) oder als
Emoji (`:…:`); jedes Zeichen wird höchstens doppelt so lang, wie die
längsten Werte es annehmen. Im Banner bleiben Namen roh.

| Art | `pingt` | `allowedMentions` | Wirkung |
|---|---|---|---|
| Beitritt | `[<ID des Mitglieds>]` | `{ parse: [], users: [<ID des Mitglieds>] }` | nur das neue Mitglied pingt |
| Abschied | `[]` | `{ parse: [] }` | niemand pingt |
| Zusammenfassung, Testnachricht | ohne | `{ parse: [] }` | niemand pingt |

Beleg: [Allowed Mentions](https://docs.discord.com/developers/resources/message#allowed-mentions-object).

Der Name ist `displayName` von discord.js, über `alsMitglied`: Spitzname,
sonst globaler Anzeigename, sonst Nutzername. Ein Partial-Mitglied beim Abschied kennt
keinen Spitznamen.

## Testnachricht

`POST …/seiten/{art}/test` ruft `loeseAus` in
`bot/src/module/begruessung/seiten.ts`. Es prüft die Regeln aus
[API der Begrüssung](../schnittstelle/begruessung.md), „Testnachricht“, und
die Grenze je Server und ruft dann `sendeTest` in
`bot/src/module/begruessung/senden.ts`, siehe [API im Bot](dashboard-api.md).
`sendeTest` baut Text und Banner wie `begruesse`, mit der angemeldeten
Person als Mitglied und dem Kanal, den `loeseAus` mit `textkanal` sucht, und setzt die Zeile `testZeile` davor, ausser die
Nachricht würde damit länger als 2000 Zeichen. `an` und die Bremse zählen
nicht. Geht nichts raus, weil der Text leer ist und das Banner scheitert,
wirft es; die API antwortet dann `503`.

## Was ins Log geht

Nur die Art und der Grund, bei Fehlern dazu ihr Text. Nie IDs oder Namen,
siehe [Datenschutz](datenschutz.md), „Was ins Log geht“.

| Zeile | Wann |
|---|---|
| `Begrüssung <Art>: Kanal fehlt oder der Bot darf dort nicht senden.` | Schritt 4, und beim Lösen der Bremse |
| `Begrüssung <Art>: Banner ohne „Dateien anhängen“, nur der Text.` | Schritt 6 |
| `Begrüssung <Art>: Banner gescheitert, nur der Text: <Fehler>` | Schritt 6 |
| `Begrüssung <Art>: Bremse an.` | das erste gezählte Ereignis |
| `Begrüssung <Art>: Bremse aus, <Zahl> gezählt.` | die Bremse löst sich |
| `Testnachricht <Art>: Banner gescheitert: <Fehler>` | beim Zeichnen für die Testnachricht |
