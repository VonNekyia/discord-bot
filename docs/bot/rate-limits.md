---
title: Rate-Limits
description: Was der Bot tut, wenn Discord mit 429 oder 5xx antwortet, wie oft er Befehle registriert, warum das Ändern von Kanälen und lange Wartezeiten der Anmeldung nicht warten, wie er Anfragen, 429, ungültige Anfragen und eigene Grenzen zählt und loggt.
code:
  - bot/src/discord/befehle.ts
  - bot/src/discord/befehle.test.ts
  - bot/src/discord/client.ts
  - bot/src/discord/client.test.ts
  - bot/src/discord/fehler.ts
  - bot/src/discord/oauth.ts
  - bot/src/discord/zaehlen.ts
  - bot/src/kern/zaehlung.ts
---

# Rate-Limits

Jede Anfrage an die REST-API geht über `@discordjs/rest` 2.6, das mit
discord.js 14 kommt, auch die vier Aufrufe der Anmeldung. Die Bibliothek
liest die Header und hält die Limits von Discord selbst ein; der Bot baut
keine Grenze von Discord nach. Er zählt aber jede Anfrage und jedes 429 mit
und loggt sie. Die Regeln von Discord stehen in der
[Doku zu Rate-Limits](https://docs.discord.com/developers/topics/rate-limits).

## Befehle registrieren

`registriere` in `bot/src/discord/befehle.ts` ersetzt beim Start alle globalen
Befehle mit einem `PUT` auf `/applications/{id}/commands`. Das ist eine
Anfrage je Start, egal wie viele Befehle es gibt. Schlägt sie fehl, läuft
der Bot weiter mit den Befehlen, die Discord schon kennt, und das Log
sagt „Befehle nicht registriert“. Den Body baut `SlashCommandBuilder` aus
`name` und `beschreibung` jedes `Befehl`; einen Namen, den Discord nicht
nimmt, lehnt er ab, bevor der Bot Discord fragt.

## Was der Bot bei 429 tut

`@discordjs/rest` wartet so lange, wie `Retry-After` verlangt, plus 50 ms
(`offset`), und schickt die Anfrage noch einmal. Der Test „registriere
wartet nach 429“ prüft das gegen die gemockte API. Nicht warten
`PATCH /channels/:id`, siehe „Kanäle ändern“, und die Anmeldung, wenn das
Warten länger als ihre Frist wäre, siehe „Anmeldung“.

## Kanäle ändern

`@discordjs/rest` zählt `PATCH /channels/:id` mit `name` oder `topic` zu
einem Sublimit (`hasSublimit`) und wartet bei 429 still, so lange Discord
es verlangt; beim Umbenennen sind das Minuten. Die Interaktion des Menüs
bliebe so lange ohne Antwort. Darum setzt `erstelleClient` in
`bot/src/discord/client.ts` `rejectOnRateLimit` auf `wartetNicht`:
`PATCH /channels/:id` wirft bei einem Rate-Limit einen `RateLimitError`
mit `retryAfter` in ms, statt zu warten. Das Menü nennt dann die
Wartezeit, siehe [Menü der Sprachräume im Bot](sprachraeume-menue.md),
„Erwartete Fehler“.

Eine Liste wie `['/channels']` reicht nicht: `rejectOnRateLimit` vergleicht
nur den Anfang der Route, und `POST /channels/:id/messages` (Begrüssung,
Menü) und `DELETE /channels/:id` (leere Räume) sollen weiter warten. Der
Test „nur PATCH /channels/:id wartet nicht auf ein Rate-Limit; Nachrichten
und Löschen warten weiter“ prüft das gegen die gemockte API, der Test
„Umbenennen bei 429 …“ die Wartezeit im Menü. Stand `@discordjs/rest`
2.6.3.

Auf ein globales Limit bis 2 s wartet auch `PATCH /channels/:id`.
`@discordjs/rest` rechnet selbst höchstens `globalRequestsPerSecond`
Anfragen je Sekunde (50) und ruft `rejectOnRateLimit` mit `global`, bevor
es die nächste schickt. Ohne diese Ausnahme scheiterte ein Knopf, sobald
der Bot in derselben Sekunde 50 andere Anfragen geschickt hat; das Warten
dauert höchstens eine Sekunde und 50 ms (`offset`). `global` steht aber
auch bei einem 429 der Route, wenn die 50 Anfragen der Sekunde gerade
verbraucht sind. Darum zählt die Wartezeit: Ein 429 beim Umbenennen mit
Minuten wirft weiter. Die Tests „auf das globale Limit von @discordjs/rest
wartet auch PATCH /channels/:id“ und „ein 429 beim Umbenennen wirft auch,
wenn die Anfragen der Sekunde verbraucht sind“ prüfen beides mit
`globalRequestsPerSecond: 1`.

Der `RateLimitError` hat keine Meldung. `alsDiscordFehler` in
`bot/src/discord/fehler.ts` gibt ihm eine mit Methode, Route und Sekunden,
etwa „Rate-Limit bei PATCH /channels/:id, noch 301 s“; die Route trägt
`:id` statt IDs.

## Anmeldung

Die vier Aufrufe der Anmeldung (`/oauth2/token`, `/oauth2/token/revoke`,
`/users/@me`, `/users/@me/guilds`) laufen über `oauthUeber` in
`bot/src/discord/oauth.ts` und `@discordjs/rest`, siehe Entscheidung
[0016](../entscheidungen/0016-debug-im-speicher-fuer-den-eigentuemer.md).
So zählen sie mit, und 429 behandelt die Bibliothek wie bei jeder anderen
Anfrage.

Sie haben eine eigene REST-Instanz mit derselben Basis wie `client.rest`,
ohne Token des Bots, und `zaehleAnfragen` hängt an ihr mit derselben
`Zaehlung`. Die Instanz schützt den Bot: Ein 429 mit `X-RateLimit-Global`
auf dem Token einer Person gilt nur für sie, nicht für Begrüssung, Räume
und Knöpfe. Der Test „ein globales 429 der Anmeldung bremst den Bot nicht
…“ prüft das.

Zwischen Personen bleibt das Warten geteilt. `@discordjs/rest` führt die
Buckets dieser Routen für alle Tokens zusammen (`majorParameter`
`global`), Discord rechnet sie aber je Token der Person. Meldet die
Anmeldung von Person A `Remaining: 0`, wartet Person B bis zum Reset. Das
nehmen wir hin: Anmeldungen sind selten, B wartet höchstens bis zur Frist
von 10 s, und danach scheitert die Anmeldung mit `?fehler=anmeldung`.

- Mit `auth: false` und eigenem Header `Authorization`: `Basic` mit ID und
  Secret der Anwendung für Tausch und Widerruf, `Bearer` mit dem Token der
  Person für die beiden `GET`. Den Token des Bots tragen sie nicht. Ohne
  `auth` löschte `@discordjs/rest` bei einem 401 den Token des Bots.
- Tausch und Widerruf schicken ihren Body als
  `application/x-www-form-urlencoded` (`passThroughBody`).
- Jeder Aufruf hat eine Frist von 10 s (`oauthFrist`), Warten auf ein
  Rate-Limit eingeschlossen. `signal` bricht Warteschlange und Anfrage ab;
  das Warten auf `Retry-After` hört nicht darauf, darum läuft der Aufruf
  zusätzlich gegen die Frist um die Wette.
- Ein kurzes `Retry-After` wartet die Bibliothek ab. Verlangt Discord
  10 s oder mehr, wirft sie gleich einen `RateLimitError` (eigenes
  `rejectOnRateLimit` der Instanz).
  Die Anmeldung scheitert dann sofort mit `?fehler=anmeldung` und der
  Zeile `Anmeldung: Tausch: Discord antwortet 429, Retry-After 60 s`.

Die Tests „bei 429 wartet die Anmeldung ein kurzes Retry-After ab …“ und
„verlangt Discord länger als die Frist, scheitert die Anmeldung gleich …“
prüfen das gegen die gemockte API, „die Frist gilt auch, während
@discordjs/rest ein Retry-After abwartet“ das Rennen.

## Zählen

`zaehleAnfragen` in `bot/src/discord/zaehlen.ts` hört auf das Ereignis
`response` von `client.rest` und der Instanz der Anmeldung, siehe
„Anmeldung“. Es kommt nach jeder Antwort von Discord,
auch bei 429, 5xx und jedem neuen Versuch. Was der Bot über das Gateway
schickt, zählt nicht. Der Bot liest nur Status und Header; den Body teilt
das Ereignis mit der Anfrage.

`Zaehlung` in `bot/src/kern/zaehlung.ts` zählt nur im Speicher, seit dem
Start des Prozesses (Entscheidung
[0016](../entscheidungen/0016-debug-im-speicher-fuer-den-eigentuemer.md)):

- je Methode und Route: Anfragen, davon 429, und die letzten Werte von
  `X-RateLimit-Limit`, `X-RateLimit-Remaining` und
  `X-RateLimit-Reset-After`; fehlt ein Header, ist der Wert `null`
  ([Header Format](https://docs.discord.com/developers/topics/rate-limits#header-format));
- jedes 429 nach `X-RateLimit-Scope` (`user`, `global`, `shared`; ohne
  Header `user`, wie bei `@discordjs/rest`) und mit `X-RateLimit-Global`;
- die ungültigen Anfragen, siehe „Ungültige Anfragen“;
- die eigenen Grenzen, siehe „Eigene Grenzen“.

Die Route rechnet `route` selbst aus dem Pfad: Zahlen werden `:id`, das
Segment nach `/webhooks/:id` und `/interactions/:id` wird `:token`, und
jedes Segment, das kein kurzes Wort wie `messages`, `@me` oder `@original`
ist, auch. Vorher entschlüsselt sie Segmente wie `%40original`. Route und
`majorParameter` von `@discordjs/rest` nimmt sie nicht: `majorParameter`
trägt bei Webhooks den Token.

`debugStand` gibt den Stand in der Form, die `GET /api/debug` ausliefert,
siehe [API der Debug-Seite](../schnittstelle/debug.md): Routen nach
Anfragen absteigend, alle vier eigenen Grenzen auch mit 0, die Shards
dieses Prozesses.

Je 429 kommt eine Zeile ins Log, nur mit Methode, Route, Scope, `global`
und Zahlen; fehlt ein Wert, steht `-`:

```text
Rate-Limit: 429 bei PATCH /channels/:id, Scope user, global nein, Retry-After 300 s, Limit 2, Remaining 0, Reset-After 300 s.
```

Die Tests „ein 429 mit Headern gibt genau eine Logzeile ohne ID und Token
…“ und „Tokens von Interaktionen und Webhooks stehen weder im Stand noch
im Log …“ prüfen das gegen die gemockte API.

## Ungültige Anfragen

401, 403 und 429 zählen in einem gleitenden Fenster von 10 min; ein 429
mit `X-RateLimit-Scope: shared` zählt nicht, so wie bei Discord. Ab
10 000 in 10 min sperrt Cloudflare die IP für eine Weile
([Invalid Request Limit](https://docs.discord.com/developers/topics/rate-limits#invalid-request-limit-aka-cloudflare-bans)).

Erreicht das Fenster 1000, also 10 % davon (Entscheidung
[0016](../entscheidungen/0016-debug-im-speicher-fuer-den-eigentuemer.md)),
steht einmal eine Warnung im Log:

```text
Rate-Limit: 1000 ungültige Anfragen in 10 min; Warnung ab 1000, Cloudflare sperrt ab 10000.
```

Eine weitere kommt erst, wenn das Fenster unter 1000 gefallen ist und sie
wieder erreicht. `invalidRequestWarning` von `@discordjs/rest` nutzt der
Bot nicht: Es zählt in festen 10 min statt gleitend und zählt auch
`shared` mit.

## Eigene Grenzen

Grenzen, die der Bot selbst setzt, sind keine von Discord. Sie zählen
mit, wie oft sie greifen (`Zaehlung#griff`):

| Name | Grenze | zählt |
|---|---|---|
| `bremse` | die Bremse der Begrüssung, siehe [Begrüssung bei Beitritt und Abschied](../benutzung/begruessung.md), „Bremse“ | einmal, wenn sie greift, nicht je gezähltem Ereignis |
| `sitzung` | 60 Anfragen je Minute und Sitzung | je `429` `zu_viele` |
| `bausteine` | 20 je Minute für jede Anfrage auf einen Baustein: Bilder, Vorschau, Aktionen | je `429` `zu_viele` |
| `testnachricht` | 3 je Minute und Server | je `429` `zu_viele` |

`sitzung` und `bausteine` stehen in
[API des Dashboards](../schnittstelle/api.md), „Grenzen je Sitzung“,
`testnachricht` im Modul Begrüssung, siehe
[API der Begrüssung](../schnittstelle/begruessung.md), „Testnachricht“.

## Was der Bot bei 5xx tut

`@discordjs/rest` versucht es nach einem 5xx bis zu dreimal mehr
(`retries`, Standard 3), dann wirft es. Eine Anfrage bricht nach 15 s ab
(`timeout`). Stand `@discordjs/rest` 2.6.3. Der Test „registriere gibt
nach 5xx auf“ setzt `retries` auf 1 und prüft, dass der Fehler ankommt.
