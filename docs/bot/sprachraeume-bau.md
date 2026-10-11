---
title: Sprachräume im Bot
description: Wie der Bot die Sprachräume baut; Module, Belegung aus den Voice States, Anlegen in einem Aufruf, nacheinander je Mitglied, erwartete Fehler, Löschen nach 2 s, Abgleich beim Start, Audit-Log und Log, was das Menü noch bringt.
code:
  - bot/src/raeume.ts
  - bot/src/sprachraeume.ts
  - bot/src/aufraeumen.ts
  - bot/src/client.ts
  - bot/src/index.ts
---

# Sprachräume im Bot

Was die Sprachräume tun, steht in [Sprachräume](../benutzung/sprachraeume.md),
die Routen in [API der Sprachräume](../schnittstelle/sprachraeume.md), warum
so in Entscheidung [0011](../entscheidungen/0011-sprachraeume-mit-knoepfen.md).
Diese Seite sagt, wie das Backend es baut, und hält die Regeln fest, die der
Code nicht brechen darf. Das Menü im Chat des Raums fehlt noch.

## Module

| Datei | Inhalt |
|---|---|
| `bot/src/sprachraeume.ts` | Einstellungen, `liste` mit `bereit`, `pruefe` mit den Regeln beim Speichern |
| `bot/src/raeume.ts` | `Raeume`: Erzeuger betreten, anlegen, verschieben, leere löschen, Abgleich beim Start; `belegung`, `eintraege` |
| `bot/src/aufraeumen.ts` | `vergiss` und `behalteNur` für alle Tabellen je Server |
| `bot/src/ordnung.ts` | `wieDiscord`: Kanäle sortieren wie Discord |

`bot/src/index.ts` ruft bei `voiceStateUpdate` `Raeume#aenderung` mit den
Kanälen vorher und nachher, bei `channelDelete` `Raeume#geloescht`. Die
Einstellungen liest `Raeume` aus einem eigenen Cache (`ladeCache`), den die
API nach jedem Speichern leert, siehe [Cache](cache.md).

## Belegung

Wer in einem Kanal ist, kommt nur aus `guild.voiceStates.cache`, als IDs
(`belegung`). Nie aus `VoiceChannel#members` oder `VoiceState#member`: Beide
lesen den Cache der Mitglieder, und der hält nur den Bot, siehe
[Datenschutz](datenschutz.md), „Was der Bot speichert“. Dann wären sie
leer oder `null`. Braucht der Bot den Namen eines Mitglieds, holt er es mit
`guild.members.fetch({ user, force: true })`; das kommt nicht in den Cache.

Voice States ohne Kanal räumt ein Sweeper alle 10 Minuten weg
(`erstelleClient` in `bot/src/client.ts`).

## Anlegen

1. Nur wenn die Sprachräume an sind und der Kanal ein Erzeuger ist.
2. Hat das Mitglied einen Raum, den es noch gibt, verschiebt der Bot es
   dorthin. Gibt es den Kanal nicht mehr, vergisst er die Zeile und legt neu
   an.
3. Höchstens ein neuer Raum je 30 s und Mitglied; die Zeit merkt sich
   `Raeume` im Speicher, und ein Timer vergisst sie nach 30 s.
4. `guild.channels.create` mit Name, Kategorie, Limit und den Einträgen aus
   `eintraege`, in einem Aufruf: die der Kategorie, dazu der Besitzer mit
   „Kanal ansehen“, „Verbinden“ und „Nachrichtenverlauf anzeigen“ und der
   Bot mit „Kanal ansehen“, „Verbinden“ und „Nachrichten senden“. Für
   dieselbe ID führt `eintraege` die Rechte zusammen; unsere sind erlaubt
   und nicht verboten.
5. Die Zeile in `raeume`, dann `guild.members.edit` mit `channel`.
   Scheitert eins davon, geht der neue Raum wieder.

Jedes Mitglied besitzt höchstens einen Raum je Server: `UNIQUE (server,
besitzer)` in der Tabelle `raeume`, siehe [Datenbank](datenbank.md),
„Tabellen“.

## Nacheinander je Mitglied

Was ein Mitglied auslöst, läuft der Reihe nach (`nacheinander`, je
`<Server>/<Mitglied>`). So legen zwei schnelle Beitritte nicht zwei Räume
an: Der zweite findet den Raum des ersten und verschiebt nur.

## Erwartete Fehler

| Code | Wann | Was der Bot tut |
|---|---|---|
| 40032 | das Mitglied ist nicht mehr verbunden, bevor das Verschieben klappt | den neuen Raum löschen, ohne Logzeile |
| 10003 | der Kanal ist schon weg | nichts, ohne Logzeile |
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
weg, leere Räume löscht der Bot, belegte bleiben. Server, die den Bot
verlassen haben, räumt `behalteNur` ab, mit derselben Regel für Shards wie
in [API im Bot](dashboard-api.md), „Aufräumen“.

## Audit-Log und Log

Ins Audit-Log von Discord schreibt der Bot nur feste Gründe
(`Sprachraum angelegt`, `Sprachraum leer`, `Sprachraum: in den eigenen
Raum`, `Sprachraum: Verschieben gescheitert`). Ins Log kommen nur Zeilen wie
`Sprachraum: nicht angelegt: <Fehler>`, ohne IDs und Namen, siehe
[Datenschutz](datenschutz.md), „Was ins Log geht“.

## Was das Menü noch bringt

Mit dem Menü kommen dazu, für den nächsten Auftrag festgehalten:

- **Umbenennen:** `@discordjs/rest` behandelt `PATCH /channels/:id` mit
  `name` als Sublimit (`hasSublimit`) und wartet bei 429 still. Der Client
  bekommt darum `rejectOnRateLimit` für `/channels`; der Bot fängt den
  `RateLimitError` und nennt die Wartezeit. Vor jedem Aufruf an Discord
  ruft er `deferReply` ephemeral, wegen der Frist von 3 s.
- **Sperren und Verstecken:** Die eigenen Rechte für alle im Raum gehen in
  einem `PATCH` mit der ganzen Liste (`permissionOverwrites.set`), nicht je
  Mitglied mit `PUT`; das Sublimit gilt dafür nicht. Entsperren und Zeigen
  räumen sie wieder ab, damit die Grenze von 1000 Einträgen (30060) nicht
  vollläuft.
