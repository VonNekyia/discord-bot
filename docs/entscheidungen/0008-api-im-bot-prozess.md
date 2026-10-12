---
title: "0008: Die API des Dashboards im Prozess des Bots"
description: Warum der Bot die API für das Dashboard selbst mit node:http ausliefert, unter demselben Origin wie die Oberfläche und mit Sitzungen in PostgreSQL, statt eines eigenen Servers, eines Frameworks oder eines Tokens im Browser.
status: gilt
date: 2026-10-11
issues: []
code:
  - bot/src/index.ts
  - bot/src/api/server.ts
  - web/serve.mjs
---

# 0008: Die API des Dashboards im Prozess des Bots

## Anlass

Der Maintainer will ein Dashboard: mit Discord anmelden, einen Server
wählen, Nachrichten und Banner für Beitritt und Abschied einstellen. Alles
liegt in PostgreSQL, siehe Entscheidung [0007](0007-postgres-mit-pg.md);
diese Entscheidung baut darauf auf. Dafür braucht es einen Teil auf dem
Server: Den Code
von Discord gegen einen Token tauschen geht nur mit dem Client-Secret, die
Einstellungen liegen in der Datenbank, und der Bot muss eine Änderung
sofort sehen.

## Entscheidung

Der Bot öffnet in seinem Prozess mit `node:http` einen HTTP-Server für die
API unter `/api/`, nur auf `127.0.0.1`. Die Oberfläche bleibt statisch; das
Dashboard ist eine Seite in `web/`, die die API mit `fetch` anspricht.
Oberfläche und API liegen unter einem Origin: Lokal leitet `web/serve.mjs`
`/api/` an den Bot weiter, in Produktion ein Reverse Proxy. Angemeldet wird
mit OAuth2 von Discord; die Sitzung liegt in PostgreSQL, der Browser hält
nur ein Cookie. Die Einzelheiten stehen in [API des Dashboards](../schnittstelle/api.md)
und [Anmeldung am Dashboard](../schnittstelle/anmeldung.md).

## Verworfene Alternativen

- **Ein eigener API-Prozess neben dem Bot.** Er bräuchte einen zweiten
  Pool und eigene Aufrufe an Discord für Server, Kanäle und Rechte. Der
  Cache des Bots sähe eine Änderung erst nach `ttl`, siehe
  [Cache](../bot/cache.md), „Grenzen“.
- **Ein Framework wie Express oder Fastify.** Rund zehn Routen mit JSON und
  einem Upload schafft `node:http`, Regel 23.
- **Ein Paket für OAuth2.** Der Ablauf sind drei Aufrufe mit `fetch`.
- **Die API auf einem anderen Origin, mit CORS.** Das Cookie müsste
  `SameSite=None` sein, jede Antwort CORS mit Credentials tragen. Mehr
  Angriffsfläche, kein Gewinn.
- **Ein Token im Browser**, etwa ein JWT in `localStorage`. Ein
  eingeschleustes Skript liest ihn, und abmelden lässt er sich nicht.
- **Seiten, die der Bot als HTML ausliefert.** Dann läge das Design an zwei
  Stellen, in `web/` und in `bot/`.

## Folgen

- Der Bot hat eine neue Angriffsfläche. Jede Route prüft Sitzung und
  Rechte, jede schreibende den Origin, siehe
  [Anmeldung am Dashboard](../schnittstelle/anmeldung.md), „Rechte“.
- Ist der Bot aus, ist das Dashboard auch aus.
- Das Dashboard geht nur mit Skript. Ohne sagt es das; alle anderen Seiten
  gehen weiter ohne, siehe [Design der Oberfläche](../frontend/design.md),
  „Harte Regeln“.
- Ein neues Secret `DISCORD_CLIENT_SECRET` und eine Redirect-URL im
  Developer Portal. Für Beitritt und Abschied fordert der Bot den
  privilegierten Intent `GuildMembers` und `Partials.GuildMember` an, siehe
  [Intents](../bot/intents.md) und
  [Begrüssung bei Beitritt und Abschied](../benutzung/begruessung.md),
  „Rechte und Intent“.
- Jede Route mit einem Server prüft die Rechte mit einem Aufruf an
  Discord. Eine Grenze je Sitzung schützt das Budget des Bots, siehe
  [API des Dashboards](../schnittstelle/api.md), „Grenzen je Sitzung“.
- Ohne `DISCORD_CLIENT_SECRET` oder `DASHBOARD_URL` startet der Bot ohne
  API. Tests und CI brauchen beides nicht.
