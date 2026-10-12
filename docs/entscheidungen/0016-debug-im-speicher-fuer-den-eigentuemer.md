---
title: "0016: Debug-Seite im Speicher, nur für den Eigentümer"
description: Warum der Bot seine Anfragen an Discord und die Rate-Limits nur im Speicher zählt, die Debug-Seite nur Eigentümer und Team der Anwendung zeigt, die Anmeldung über @discordjs/rest läuft und das Log ab 1000 ungültigen Anfragen warnt.
status: gilt
date: 2026-10-12
issues: [25]
code:
  - bot/src/api/server.ts
  - bot/src/api/anmeldung.ts
---

# 0016: Debug-Seite im Speicher, nur für den Eigentümer

## Anlass

Issue #25: Niemand sieht, wie nah der Bot an den Rate-Limits von Discord
ist. Discord verlangt, die Limits aus den Headern zu lesen, statt sie fest
einzubauen
([Rate Limits](https://docs.discord.com/developers/topics/rate-limits)).
Die Anmeldung umgeht heute `@discordjs/rest` mit eigenem `fetch` und hält
bei 429 `Retry-After` nicht ein. Vor dem Bau waren vier Fragen offen; der
Maintainer hat sie am 2026-10-12 entschieden.

## Entscheidung

- **Wer:** Die Debug-Seite sieht nur der Eigentümer der Anwendung oder ein
  Mitglied ihres Teams.
- **Wo:** Die Zahlen liegen nur im Speicher des Prozesses und gelten seit
  seinem Start. Die Geschichte steht im Log.
- **Anmeldung:** Die vier Aufrufe der Anmeldung laufen über
  `@discordjs/rest`. So zählt eine Stelle alles, und 429 behandelt die
  Bibliothek wie beim Bot.
- **Warnung:** Ab 1000 ungültigen Anfragen in 10 min, also 10 % der Grenze
  von Cloudflare, steht eine Warnung im Log.

Wie die Seite ins Dashboard kommt, legt eine eigene Seite unter
`docs/schnittstelle/` fest, wenn der Baukasten des Dashboards steht
(#29, #30). Zählen und Loggen hängen nicht davon ab.

## Verworfene Alternativen

- **Jeder mit „Server verwalten“ sieht die Seite.** Die Zahlen gelten für
  den ganzen Bot, auch für fremde Server. Die Rechte im Dashboard hängen
  sonst immer an einem Server.
- **Zahlen in PostgreSQL.** Sie überlebten einen Neustart, brauchten aber
  eine Tabelle, Aufräumen und Schreibzugriffe bei jeder Anfrage an
  Discord. Für die Geschichte reicht das Log.
- **Anmeldung mit eigenem `fetch`, das die Header selbst liest.** Zwei
  Stellen zählten, und die Behandlung von 429 gäbe es zweimal.
- **Warnung ab 500 oder 5000.** 500 schlägt schon bei vielen abgelaufenen
  Anmeldungen an. Bei 5000 bleibt wenig Zeit bis zur Sperre.

## Folgen

- Nach einem Neustart beginnen alle Zahlen bei 0.
- `GET /api/ich` braucht den Eigentümer der Anwendung. Der Bot hält ihn
  5 min; wer das Team verlässt, sieht die Seite bis zu 5 min länger.
- Mit mehreren Prozessen zählt jeder für sich, bis jemand die Zahlen
  zusammenführt.
