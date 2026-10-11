---
title: API im Bot
description: Wie der Bot die API des Dashboards baut; Module, Start und Ende, die Reihenfolge der Prüfungen, Grenzen und Zeitlimits im Prozess, Bilder und Vorschau, Fehler und Aufräumen.
code:
  - bot/src/api.ts
  - bot/src/anmeldung.ts
  - bot/src/begruessung.ts
  - bot/src/banner.ts
  - bot/src/index.ts
---

# API im Bot

Was die API kann, steht im Vertrag: [API des Dashboards](../schnittstelle/api.md)
und [Anmeldung am Dashboard](../schnittstelle/anmeldung.md). Diese Seite
sagt, wie das Backend ihn baut: mit `node:http` im Prozess des Bots, ohne
Paket dazu, siehe Entscheidung [0008](../entscheidungen/0008-api-im-bot-prozess.md).
Bilder und Banner zeichnet `@napi-rs/canvas`, siehe Entscheidung
[0009](../entscheidungen/0009-banner-mit-napi-rs-canvas.md).

## Module

| Datei | Inhalt |
|---|---|
| `bot/src/api.ts` | `erstelleApi`: Routen, Origin, Grenzen, Rechte, Body; dazu `apiUmgebung`, `kanaele`, `Grenze` |
| `bot/src/anmeldung.ts` | OAuth2 mit `fetch`, Sitzungen in PostgreSQL, Cookies |
| `bot/src/begruessung.ts` | Standardwerte, `pruefe` mit den Regeln beim Speichern, Platzhalter, Lesen, Speichern und Löschen von Einstellungen und Bildern |
| `bot/src/banner.ts` | `masse`, `bereiteVor` für ein hochgeladenes Bild, `zeichne` für das Banner |
| `bot/src/senden.ts` | `banner` für Vorschau und Senden, `sendeTest` für die Testnachricht; `begruesse` und die Bremse, siehe [Begrüssung senden](begruessung-senden.md) |

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
| Grenze | Routen mit `{id}`; `PUT …/bild` und `GET …/vorschau` auch die für Bilder | `429` `zu_viele` |
| Rechte | Routen mit `{id}` | `404` `nicht_gefunden`, `403` `kein_recht` |
| Body | `PUT …/begruessung/{art}` | `415` `kein_json`, `413` `zu_gross` |
| Body | `PUT …/bild` | `415` `bildtyp`, `413` `bild_zu_gross` |
| Regeln | `PUT …/begruessung/{art}` | `400` mit Code und Feld |
| Bild | `PUT …/bild` | siehe „Bilder“ |
| Regeln | `POST …/test` | `400` `test_ohne_kanal`, `kanal_unbekannt`, `test_ohne_inhalt` |
| Grenze je Server | `POST …/test` | `429` `zu_viele`; erst hier, nach Rechten und Regeln |
| Senden | `POST …/test` | `503` `nicht_erreichbar`, siehe [Begrüssung senden](begruessung-senden.md), „Testnachricht“ |

Bei den Rechten werden Unknown Member (10007) und Unknown User (10013) von
Discord zu `403` `kein_recht`. Der Cache von discord.js hält ohnehin keine
Mitglieder, siehe [Datenschutz](datenschutz.md), „Was der Bot speichert“;
`force: true` holt das Mitglied auch dann neu, wenn sich das einmal
ändert.

Wer Einstellungen oder ein Bild schreibt oder löscht, ruft danach
`einstellungen.delete` für den Server, siehe [Cache](cache.md), „So geht
es“.

## Grenzen und Zeitlimits

| Was | Wert | Wie |
|---|---|---|
| Anfragen mit `{id}` je Sitzung | 60 je Minute | `Grenze`: gleitendes Fenster im Speicher, Schlüssel ist der Hash der Sitzung |
| Bild, Vorschau und Testnachricht je Sitzung | 20 je Minute | eine zweite `Grenze`, zusätzlich zur ersten |
| Testnachricht je Server | 3 je Minute | eine dritte `Grenze`, Schlüssel ist der Server; sie zählt erst nach Rechten und Regeln, sonst sperrte eine fremde Sitzung |
| JSON-Body | 16 KiB | zuerst `Content-Length`; sonst zählt das Lesen mit und hört an der Grenze auf |
| Bild | 4 MiB | wie beim JSON-Body |
| Header einer Anfrage | 10 s | `headersTimeout` |
| ganze Anfrage | 30 s | `requestTimeout` |
| ein Aufruf an Discord für OAuth2 | 10 s | `AbortSignal.timeout` |
| ein Avatar vom CDN | 5 s | `AbortSignal.timeout` in `holeAvatar` |

- Ihre Uhr ist `uhr` aus `ApiOptionen`, ohne Angabe `Date.now()`; Tests
  setzen eine eigene, um eine Minute vorzurücken.
- Die Grenzen leben im Speicher des Prozesses. Ein Neustart setzt sie
  zurück; eine zweite Instanz hätte ihre eigenen.
- Liegt bei der Antwort noch ungelesener Body an, schliesst die Verbindung
  danach (`Connection: close`), statt ihn zu Ende zu lesen.

## Bilder

`PUT …/bild` prüft und speichert in dieser Reihenfolge (`bereiteVor` in
`bot/src/banner.ts`):

1. `Content-Type` ist PNG, JPEG oder WebP, sonst `415` `bildtyp`.
2. Der Body hat höchstens 4 MiB, sonst `413` `bild_zu_gross`.
3. Die Datei beginnt mit der Signatur von PNG (`89 50 4E 47 0D 0A 1A 0A`),
   JPEG (`FF D8 FF`) oder WebP (`RIFF`, vier Byte, `WEBP`), sonst `415`
   `bild_unlesbar` (`format`). `@napi-rs/canvas` liest auch SVG, GIF und
   anderes; der `Content-Type` setzt der Client frei, und jeder weitere
   Decoder wäre Angriffsfläche.
4. Breite und Höhe kommen aus dem Kopf der Datei (`masse`, `new Image()`),
   ohne zu dekodieren. 20000 × 20000 px dauern so 0,3 ms ohne Speicher.
   Keine Masse heisst `415` `bild_unlesbar`, über 4096 px je Seite `413`
   `bild_zu_gross`, unter 200 px `400` `bild_zu_klein`.
5. Erst jetzt dekodiert `loadImage`; scheitert es, `415` `bild_unlesbar`.
   `loadImage` wendet die EXIF-Drehung an. Die Masse aus Schritt 4 sind
   die vor der Drehung; für die Grenzen spielt das keine Rolle, weil sie
   für beide Seiten gleich sind.
6. Das Bild wird auf 1100 × 440 px skaliert und mittig beschnitten, wie
   das Banner es braucht, und als WebP mit Qualität 85 neu kodiert. EXIF,
   GPS und andere Metadaten fallen dabei weg.
7. Das Ergebnis kommt in die Tabelle `bilder`, ein neues ersetzt das alte.

`DELETE …/bild` löscht die Zeile und setzt `banner` auf `false`, in einer
Anweisung (`loescheBild`).

`GET …/vorschau` zeichnet das Banner wie beim Senden (`banner` in
`bot/src/senden.ts`). Das Mitglied ist das aus der Prüfung der Rechte,
also mit Spitzname und Avatar auf diesem Server. Ohne Bild `404`
`kein_bild`. Die Vorschau zeichnet auch, wenn `banner` aus ist, damit das
Team sie vor dem Einschalten sieht.

## Fehler

Ein erwarteter Fehler wird zu seinem Code aus dem Vertrag. Alles andere,
etwa ein Fehler der Datenbank oder ein `5xx` von Discord, wird `503`
`nicht_erreichbar` mit einer Logzeile `API <Route>: <Fehler>`. Was ins Log
darf, steht in [Datenschutz](datenschutz.md), „Was ins Log geht“.

## Aufräumen

- Abgelaufene Sitzungen löscht `raeumeAuf`, wenn die API öffnet, und dann
  jede Stunde.
- Einstellungen und Bilder von Servern, die der Bot verlassen hat, löschen
  `vergiss` bei `guildDelete` und `behalteNur` beim Start, siehe
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
  weitere Prozess fände `API_PORT` belegt, und jeder hätte seine eigenen
  Grenzen. Dann braucht die API einen Weg zu allen Shards.
