---
title: API im Bot
description: Wie der Bot die API des Dashboards baut; Module, Start und Ende, die Reihenfolge der Prüfungen, Grenzen und Zeitlimits im Prozess, Fehler und Aufräumen.
code:
  - bot/src/api.ts
  - bot/src/anmeldung.ts
  - bot/src/begruessung.ts
  - bot/src/index.ts
---

# API im Bot

Was die API kann, steht im Vertrag: [API des Dashboards](../schnittstelle/api.md)
und [Anmeldung am Dashboard](../schnittstelle/anmeldung.md). Diese Seite
sagt, wie das Backend ihn baut: mit `node:http` im Prozess des Bots, ohne
Paket dazu, siehe Entscheidung [0008](../entscheidungen/0008-api-im-bot-prozess.md).
Bilder und Vorschau fehlen noch; ihre Routen geben `404`.

## Module

| Datei | Inhalt |
|---|---|
| `bot/src/api.ts` | `erstelleApi`: Routen, Origin, Grenze, Rechte, Body; dazu `apiUmgebung`, `kanaele`, `Grenze` |
| `bot/src/anmeldung.ts` | OAuth2 mit `fetch`, Sitzungen in PostgreSQL, Cookies |
| `bot/src/begruessung.ts` | Standardwerte, `pruefe` mit den Regeln beim Speichern, Lesen, Speichern, Löschen |

## Start und Ende

- Die API öffnet erst, wenn der Bot bei Discord angemeldet ist
  (`ClientReady` in `bot/src/index.ts`). Sie braucht die Application-ID
  als Client-ID und den Cache der Server. Bis dahin antwortet `serve.mjs`
  mit `502`.
- Sie lauscht nur auf `127.0.0.1` und `API_PORT`. Kann sie das nicht,
  etwa weil der Port belegt ist, loggt der Bot `API nicht gestartet:
  <Fehler>` und läuft ohne API weiter.
- Ist `DASHBOARD_URL` keine Adresse mit http oder https oder `API_PORT` kein
  Port, endet der Bot beim Start mit Exit 1. Ein `/` am Ende von
  `DASHBOARD_URL` fällt weg.
- Beim Beenden schliesst der Bot zuerst die API, siehe
  [Datenbank](datenbank.md), „Pool“.

## Ablauf einer Anfrage

Jede Anfrage durchläuft diese Schritte; sie hört beim ersten Fehler auf:

| Schritt | Für | Fehler |
|---|---|---|
| Route | alle | `404` `nicht_gefunden` |
| Origin | `PUT`, `POST`, `DELETE` | `403` `origin_falsch` |
| Sitzung | alle ausser `/api/anmelden…` | `401` `nicht_angemeldet` |
| Grenze | Routen mit `{id}` | `429` `zu_viele` |
| Rechte | Routen mit `{id}` | `404` `nicht_gefunden`, `403` `kein_recht` |
| Body | `PUT …/begruessung/{art}` | `415` `kein_json`, `413` `zu_gross` |
| Regeln | `PUT …/begruessung/{art}` | `400` mit Code und Feld |

Bei den Rechten werden Unknown Member (10007) und Unknown User (10013) von
Discord zu `403` `kein_recht`. Der Cache von discord.js hält ohnehin keine
Mitglieder, siehe [Datenschutz](datenschutz.md), „Was der Bot speichert“;
`force: true` holt das Mitglied auch dann neu, wenn sich das einmal
ändert.

## Grenzen und Zeitlimits

| Was | Wert | Wie |
|---|---|---|
| Anfragen mit `{id}` je Sitzung | 60 je Minute | `Grenze`: gleitendes Fenster im Speicher, Schlüssel ist der Hash der Sitzung |
| JSON-Body | 16 KiB | zuerst `Content-Length`; sonst zählt das Lesen mit und hört an der Grenze auf |
| Header einer Anfrage | 10 s | `headersTimeout` |
| ganze Anfrage | 30 s | `requestTimeout` |
| ein Aufruf an Discord für OAuth2 | 10 s | `AbortSignal.timeout` |

- Die Grenze lebt im Speicher des Prozesses. Ein Neustart setzt sie
  zurück; eine zweite Instanz hätte ihre eigene.
- Liegt bei der Antwort noch ungelesener Body an, schliesst die Verbindung
  danach (`Connection: close`), statt ihn zu Ende zu lesen.

## Fehler

Ein erwarteter Fehler wird zu seinem Code aus dem Vertrag. Alles andere,
etwa ein Fehler der Datenbank oder ein `5xx` von Discord, wird `503`
`nicht_erreichbar` mit einer Logzeile `API <Route>: <Fehler>`. Was ins Log
darf, steht in [Datenschutz](datenschutz.md), „Was ins Log geht“.

## Aufräumen

- Abgelaufene Sitzungen löscht `raeumeAuf`, wenn die API öffnet, und dann
  jede Stunde.
- Einstellungen von Servern, die der Bot verlassen hat, löschen `vergiss`
  bei `guildDelete` und `behalteNur` beim Start, siehe
  [Begrüssung bei Beitritt und Abschied](../benutzung/begruessung.md),
  „Wenn etwas fehlt“.
- Startet der `ShardingManager` den Bot in mehreren Prozessen, sieht jeder
  Prozess nur die Server seiner Shards (`client.shard`). `behalteNur`
  gleicht dann nur unter ihnen ab: Ein Server liegt auf Shard
  `(server >> 22) % count`
  ([Doku von Discord](https://docs.discord.com/developers/events/gateway#sharding)).
  Ohne `ShardingManager` ist `client.shard` `null`, und der Abgleich gilt
  für alle. Der Test „mit dem ShardingManager gleicht ein Prozess nur …“
  prüft das.

## Was noch fehlt

- **Mehrere Prozesse.** Heute läuft der Bot in einem Prozess. Mit dem
  `ShardingManager` sähe die API nur die Server ihres Prozesses, jeder
  weitere Prozess fände `API_PORT` belegt, und jeder hätte seine eigene
  Grenze. Dann braucht die API einen Weg zu allen Shards.
