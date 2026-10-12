---
title: Rate-Limits
description: Was der Bot tut, wenn Discord mit 429 oder 5xx antwortet, wie oft er Befehle registriert, und warum nur das Ändern von Kanälen nicht wartet.
code:
  - bot/src/befehle.ts
  - bot/src/befehle.test.ts
  - bot/src/client.ts
  - bot/src/client.test.ts
---

# Rate-Limits

Jede Anfrage an die REST-API geht über `@discordjs/rest` 2.6, das mit
discord.js 14 kommt. Es hält die Limits von Discord selbst ein. Eigenen
Code dafür hat der Bot nicht. Die Regeln von Discord stehen in der
[Doku zu Rate-Limits](https://discord.com/developers/docs/topics/rate-limits).

## Befehle registrieren

`registriere` in `bot/src/befehle.ts` ersetzt beim Start alle globalen
Befehle mit einem `PUT` auf `/applications/{id}/commands`. Das ist eine
Anfrage je Start, egal wie viele Befehle es gibt. Schlägt sie fehl, läuft
der Bot weiter mit den Befehlen, die Discord schon kennt, und das Log
sagt „Befehle nicht registriert“.

## Was der Bot bei 429 tut

`@discordjs/rest` wartet so lange, wie `Retry-After` verlangt, plus 50 ms
(`offset`), und schickt die Anfrage noch einmal. Der Test „registriere
wartet nach 429“ prüft das gegen die gemockte API. Nur `PATCH /channels/:id`
wartet nicht, siehe „Kanäle ändern“.

## Kanäle ändern

`@discordjs/rest` zählt `PATCH /channels/:id` mit `name` oder `topic` zu
einem Sublimit (`hasSublimit`) und wartet bei 429 still, so lange Discord
es verlangt; beim Umbenennen sind das Minuten. Die Interaktion des Menüs
bliebe so lange ohne Antwort. Darum setzt `erstelleClient` in
`bot/src/client.ts` `rejectOnRateLimit` auf `wartetNicht`: Nur
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

## Was der Bot bei 5xx tut

`@discordjs/rest` versucht es nach einem 5xx bis zu dreimal mehr
(`retries`, Standard 3), dann wirft es. Eine Anfrage bricht nach 15 s ab
(`timeout`). Stand `@discordjs/rest` 2.6.3. Der Test „registriere gibt
nach 5xx auf“ setzt `retries` auf 1 und prüft, dass der Fehler ankommt.
