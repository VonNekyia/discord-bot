---
title: Sprachräume im Bot
description: Wie der Bot die Sprachräume baut; Module, Belegung aus den Voice States, Anlegen in einem Aufruf mit dem Menü danach, nacheinander je Mitglied, erwartete Fehler, Löschen nach 2 s, Abgleich beim Start, Audit-Log und Log.
code:
  - bot/src/module/sprachraeume/raeume.ts
  - bot/src/module/sprachraeume/sprachraeume.ts
  - bot/src/kern/aufraeumen.ts
  - bot/src/discord/client.ts
  - bot/src/discord/sprachkanaele.ts
  - bot/src/discord/server.ts
  - bot/src/index.ts
---

# Sprachräume im Bot

Was die Sprachräume tun, steht in [Sprachräume](../benutzung/sprachraeume.md),
die Routen in [API der Sprachräume](../schnittstelle/sprachraeume.md), warum
so in Entscheidung [0011](../entscheidungen/0011-sprachraeume-mit-knoepfen.md).
Diese Seite sagt, wie das Backend es baut, und hält die Regeln fest, die der
Code nicht brechen darf. Das Menü im Chat jedes Raums steht in
[Menü der Sprachräume im Bot](sprachraeume-menue.md).

## Module

| Datei | Inhalt |
|---|---|
| `bot/src/module/sprachraeume/sprachraeume.ts` | Einstellungen, `pruefe` mit den Regeln beim Speichern |
| `bot/src/module/sprachraeume/raeume.ts` | `Raeume`: Erzeuger betreten, anlegen, verschieben, Menü posten, leere löschen, Abgleich beim Start; `eintraege`, `besitzerVon` |
| `bot/src/discord/sprachkanaele.ts` | die Discord-Schicht für die Sprachräume: `sprachListe` mit `bereit`, `belegung`, `hatKanal`, `kategorieVon`, `eintraegeVon`, `holeMitglied`, `legeSprachkanalAn`, `verschiebe`, `loescheKanal`, `sendeMenue`; alles über den Griff `Server`, Fehler als `DiscordFehler` |
| `bot/src/discord/rechte.ts` | `Eintrag` mit `art` (`rolle` oder `person`) und `Recht` mit den Bits, die das Modul braucht |
| `bot/src/module/sprachraeume/menue.ts`, `bot/src/module/sprachraeume/knoepfe.ts`, `bot/src/module/sprachraeume/raumrechte.ts` | das Menü, siehe [Menü der Sprachräume im Bot](sprachraeume-menue.md) |
| `bot/src/kern/aufraeumen.ts` | `Aufraeumen` mit `vergiss` und `behalteNur` für die Tabellen aller Module; die Sprachräume nennen `sprachraeume` und `raeume` in `bot/src/module/sprachraeume/modul.ts` |
| `bot/src/discord/ordnung.ts` | `wieDiscord`: Kanäle sortieren wie Discord |

`bot/src/index.ts` ruft bei `voiceStateUpdate` `Raeume#aenderung` mit dem
Griff des Servers (`serverVon`) und den Kanälen vorher und nachher, bei `channelDelete` `Raeume#geloescht`. Die
Einstellungen liest `Raeume` aus einem eigenen Cache (`ladeCache`), den die
API nach jedem Speichern leert, siehe [Cache](cache.md).

## Belegung

Wer in einem Kanal ist, kommt nur aus `guild.voiceStates.cache`, als IDs
(`belegung` in `bot/src/discord/sprachkanaele.ts`). Nie aus `VoiceChannel#members` oder `VoiceState#member`: Beide
lesen den Cache der Mitglieder, und der hält nur den Bot, siehe
[Datenschutz](datenschutz.md), „Was der Bot speichert“. Dann wären sie
leer oder `null`. Braucht der Bot den Namen eines Mitglieds, holt er es mit
`holeMitglied`, also `guild.members.fetch({ user, force: true })`; das kommt
nicht in den Cache.

Voice States ohne Kanal räumt ein Sweeper alle 10 Minuten weg
(`erstelleClient` in `bot/src/discord/client.ts`).

## Anlegen

1. Nur wenn die Sprachräume an sind und der Kanal ein Erzeuger ist.
2. Hat das Mitglied einen Raum, den es noch gibt, verschiebt der Bot es
   dorthin. Gibt es den Kanal nicht mehr, vergisst er die Zeile und legt neu
   an.
3. Höchstens ein neuer Raum je 30 s und Mitglied; die Zeit merkt sich
   `Raeume` im Speicher, und ein Timer vergisst sie nach 30 s.
4. `legeSprachkanalAn` mit Name, Kategorie, Limit und den Einträgen aus
   `eintraege`, in einem Aufruf (`guild.channels.create`): die der Kategorie, dazu der Besitzer mit
   „Kanal ansehen“, „Verbinden“ und „Nachrichtenverlauf anzeigen“ und der
   Bot mit „Kanal ansehen“, „Verbinden“ und „Nachrichten senden“. Für
   dieselbe ID führt `eintraege` die Rechte zusammen; unsere sind erlaubt
   und nicht verboten.
5. Die Zeile in `raeume`, dann `verschiebe` (`guild.members.edit` mit `channel`).
   Scheitert eins davon, geht der neue Raum wieder.
6. Das Menü in den Textchat des Raums (`menue` aus `bot/src/module/sprachraeume/menue.ts`).
   Scheitert es, bleibt der Raum ohne Knöpfe, mit einer Logzeile; bei
   40032 und 10003 ohne.

Jedes Mitglied besitzt höchstens einen Raum je Server: `UNIQUE (server,
besitzer)` in der Tabelle `raeume`, siehe [Datenbank](datenbank.md),
„Tabellen“.

## Nacheinander je Mitglied

Was ein Mitglied auslöst, läuft der Reihe nach (`nacheinander`, je
`<Server>/<Mitglied>`). So legen zwei schnelle Beitritte nicht zwei Räume
an: Der zweite findet den Raum des ersten und verschiebt nur.

## Erwartete Fehler

`erwartet` in `bot/src/module/sprachraeume/raeume.ts` liest den Code von
`DiscordFehler`, siehe [Struktur von Bot und Oberfläche](../entwicklung/struktur.md),
„Die Discord-Schicht“.

| Code | Wann | Was der Bot tut |
|---|---|---|
| 40032 (`nicht_verbunden`) | das Mitglied ist nicht mehr verbunden, bevor das Verschieben klappt | den neuen Raum löschen, ohne Logzeile |
| 10003 (`nicht_gefunden`) | der Kanal ist schon weg, auch beim Löschen | nichts, ohne Logzeile |
| 50013 | dem Bot fehlt ein Recht, auch eins aus den Einträgen der Kategorie | nichts anlegen, eine Logzeile |
| 30013 | der Server hat 500 Kanäle | nichts anlegen, eine Logzeile |

Belege: [JSON Error Codes](https://docs.discord.com/developers/topics/opcodes-and-status-codes#json-json-error-codes).

## Löschen

Verlässt jemand einen Raum und ist er dann leer, wartet `Raeume` 2 s und
prüft die Belegung neu. Ist er noch leer, löscht der Bot Zeile und Kanal.
Kommt in der Zeit jemand, bleibt er. Eine neue Wartezeit für denselben Raum
bricht die alte ab. So überholt das Löschen kein Verschieben, das gerade
läuft. Wird ein Kanal gelöscht, auch von Hand, vergisst `geloescht` die
Zeile.

## Abgleich beim Start

Nach `ClientReady` ruft `bot/src/index.ts` `Raeume#gleicheAb` für die
Server im Cache, also die Shards dieses Prozesses: Zeilen ohne Kanal fallen
weg, leere Räume löscht der Bot, belegte bleiben. Er geht Server für Server
und Raum für Raum vor, nacheinander. Server, die den Bot
verlassen haben, räumt `Aufraeumen#behalteNur` ab, mit derselben Regel für Shards wie
in [API im Bot](dashboard-api.md), „Aufräumen“.

## Audit-Log und Log

Ins Audit-Log von Discord schreibt der Bot nur feste Gründe
(`Sprachraum angelegt`, `Sprachraum leer`, `Sprachraum: in den eigenen
Raum`, `Sprachraum: Verschieben gescheitert`). Ins Log kommen nur Zeilen wie
`Sprachraum: nicht angelegt: <Fehler>` oder
`Sprachraum: Menü nicht gesendet: <Fehler>`, ohne IDs und Namen, siehe
[Datenschutz](datenschutz.md), „Was ins Log geht“.
