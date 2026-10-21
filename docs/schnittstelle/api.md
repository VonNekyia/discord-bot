---
title: API des Dashboards
description: Die Grundregeln der API unter /api/, ihre allgemeinen Routen, Typen, Grenzen je Sitzung, Fehler und Statuscodes, die Weiterleitung von serve.mjs.
code:
  - bot/src/index.ts
  - bot/src/api/server.ts
  - web/serve.mjs
---

# API des Dashboards

Der Bot bietet dem Dashboard eine JSON-API unter `/api/`, in seinem eigenen
Prozess, siehe Entscheidung [0008](../entscheidungen/0008-api-im-bot-prozess.md).
Diese Seite und die übrigen unter `docs/schnittstelle/` sind der Vertrag
zwischen `bot/` und `web/`: Was dort steht, baut das Backend, und nur das
nutzt das Frontend. Wer eine Route ändert, ändert zuerst den Vertrag.
Anmeldung, Sitzung und Rechte stehen in
[Anmeldung am Dashboard](anmeldung.md). Was das Dashboard je Server zeigt,
melden die Module als Seiten an, siehe [Baukasten des Dashboards](baukasten.md).

## Grundregeln

- JSON in UTF-8, in beide Richtungen. Discord-IDs sind Strings.
- Jede Route ausser `GET /api/anmelden` und `GET /api/anmelden/zurueck`
  braucht eine Sitzung, sonst `401`.
- `PUT`, `POST` und `DELETE` prüfen den Header `Origin`, siehe
  [Anmeldung am Dashboard](anmeldung.md), „Origin“.
- Ein JSON-Body hat höchstens 16 KiB, sonst `413` `zu_gross`.
- Jeder Fehler hat einen festen Code, siehe „Fehler“ unten.
- Jede Antwort trägt `Cache-Control: no-store` und
  `X-Content-Type-Options: nosniff`.

## Routen

| Methode und Pfad | Antwort |
|---|---|
| `GET /api/anmelden` | `302` zu Discord |
| `GET /api/anmelden/zurueck` | `302` zu `/dashboard/`, bei einem Fehler zu `/dashboard/?fehler=anmeldung` |
| `POST /api/abmelden` | `204`; die Sitzung ist gelöscht, das Cookie auch |
| `GET /api/ich` | `200` `Ich` |
| `GET /api/server` | `200` `Server[]` |
| `… /api/server/{id}/seiten…` | siehe [Baukasten des Dashboards](baukasten.md), „Routen“ |
| `GET /api/debug` | siehe [API der Debug-Seite](debug.md) |

Jede Route mit `{id}` prüft zuerst die Rechte, siehe
[Anmeldung am Dashboard](anmeldung.md), „Rechte“. Den Ablauf der beiden
Routen unter `/api/anmelden` beschreibt [Anmeldung am Dashboard](anmeldung.md),
„Ablauf“.

## Typen

```ts
type Ich = { id: string; name: string; avatar: string | null; debug: boolean };
type Server = { id: string; name: string; icon: string | null };
```

- `Ich.name` ist der Anzeigename bei Discord, sonst der Nutzername.
- `Ich.debug` ist `true`, wenn die Person die Debug-Seite sehen darf,
  siehe [API der Debug-Seite](debug.md), „Wer sie sehen darf“.
- `avatar` und `icon` sind volle URLs unter `https://cdn.discordapp.com/`
  mit `size=128`, oder `null`. 128 px reichen für 56 px auf einem
  Bildschirm mit doppelter Dichte. Die Oberfläche nutzt die URL, wie sie
  kommt.
- `GET /api/server` liefert die Server, auf denen die Person beim Anmelden
  „Server verwalten“ hatte und auf denen der Bot ist, nach Namen sortiert.
- Ein Server, auf dem der Bot fehlt oder den die Person nicht verwalten
  darf, steht nicht in der Liste. Ist sie leer, zeigt die Oberfläche einen
  leeren Zustand.

## Grenzen je Sitzung

| Was | Höchstens | Warum |
|---|---|---|
| alle Routen mit `{id}` und `GET /api/debug` zusammen | 60 je Minute und Sitzung | jede prüft die Rechte mit einem Aufruf an Discord; eine Sitzung soll nicht das Budget des Bots verbrauchen, das er für Interaktionen braucht |
| `PUT`, `GET` und `POST` auf einen Baustein, siehe [Baukasten](baukasten.md), „Routen“ | 20 je Minute und Sitzung | sie dekodieren oder zeichnen Bilder oder lösen etwas in Discord aus |

Darüber `429` `zu_viele` mit `Retry-After` in Sekunden. Ein Aufruf zählt zu
jeder Zeile, die passt. Beide Grenzen werden vor den Rechten geprüft,
damit eine abgelehnte Anfrage Discord nichts kostet. Ein Modul kann für
einen Baustein eine eigene Grenze haben, etwa die Testnachricht, siehe
[API der Begrüssung](begruessung.md), „Testnachricht“.

## Fehler

Jeder Fehler hat den Body `Fehler`:

```ts
type Fehler = { code: string; feld?: string };
```

`code` ist fest und maschinenlesbar; `feld` steht nur bei `400`, siehe
[Baukasten](baukasten.md), „Fehler am Feld“. Den Satz zu einem Code
liefert die Seite in `saetze`; die Codes hier übersetzt die Oberfläche
selbst.

| Status | Code | Wann |
|---|---|---|
| `400` | `ungueltig` und die Codes der Module, siehe [API der Begrüssung](begruessung.md) und [API der Sprachräume](sprachraeume.md) | Eingabe ungültig, oder für eine Aktion fehlt etwas |
| `401` | `nicht_angemeldet` | keine oder abgelaufene Sitzung; die Oberfläche zeigt die Anmeldung |
| `403` | `kein_recht` | kein „Server verwalten“ auf diesem Server; bei `GET /api/debug` nicht Eigentümer der Anwendung und nicht in ihrem Team |
| `403` | `origin_falsch` | `Origin` fehlt oder passt nicht |
| `404` | `nicht_gefunden` | Route, Server, Seite oder Baustein unbekannt, oder der Bot ist nicht auf dem Server |
| `409` | `modul_aus` | das Modul der Seite ist auf dem Server aus, siehe [Board der Module](module.md), „Ein Modul ist aus“; die Oberfläche zeigt den Satz und holt die Seiten neu wie nach `alleNeu`, siehe [Baukasten](baukasten.md), „Typen“ |
| `413` | `zu_gross` | JSON-Body zu gross |
| `415` | `kein_json` | JSON ohne `Content-Type: application/json` |
| `429` | `zu_viele` | siehe „Grenzen je Sitzung“, mit `Retry-After` |
| `503` | `nicht_erreichbar` | Discord oder die Datenbank antwortet nicht |

Ein Modul kann weitere Codes mit `404`, `413` oder `415` melden, etwa für
Bilder; sie stehen auf seiner Seite.

## Beispiele

Zum Vertrag gehören Beispiele: echte Antworten des Bots als JSON, eine
Datei je Beispiel in `docs/schnittstelle/beispiele/`. Bot und Oberfläche
werden in der CI an ihnen gemessen, siehe Entscheidung
[0022](../entscheidungen/0022-beispiele-als-vertragstest.md).

```json
{
  "route": "GET /api/ich",
  "status": 200,
  "typ": "Ich",
  "body": { "id": "100000000000000001", "name": "Mia", "avatar": null, "debug": false }
}
```

| Feld | Inhalt |
|---|---|
| `route` | Methode und Pfad wie in den Tabellen der Routen, mit `{id}`, `{seite}` und `{baustein}` |
| `status` | der Status der Antwort |
| `typ` | der Typ des Body im Vertrag, mit `[]` für eine Liste |
| `body` | der Body, so wie der Bot ihn schickt |

- **Typen mit Beispiel:** `Ich`, `Server[]`, `Debug`, `Seite[]`,
  `Gespeichert`, `Satz` und `Fehler`. Von jedem gibt es mindestens ein
  Beispiel. `Fehler` steht allgemein da, nicht je Route: einmal mit `feld`
  und einmal ohne.
- **Bausteine:** Die Beispiele für `Seite[]` zeigen zusammen jede Art von
  Baustein und jedes optionale Feld mindestens einmal, dazu einen `fund`.
- **Werte:** nur erfundene (`AGENTS.md`, Regel 21). IDs wie
  `100000000000000001`, Namen wie „Mia“, Server „Terranova“.
- **Name der Datei:** klein, ASCII, mit `-`, etwa `ich.json` oder
  `fehler-feld.json`.
- **Wer schreibt:** Die Dateien schreibt der Test des Bots mit
  `BEISPIELE_SCHREIBEN=1`, nicht die Hand. Eine Datei, die kein Fall mehr
  erzeugt, löscht er dabei; ohne die Variable lässt sie seinen Test
  fallen.
- **Unbekannter Typ:** Ein Beispiel mit einem `typ`, den die Oberfläche
  noch nicht prüft, überspringt ihr Test sichtbar.

Wer einen Typ ändert, ändert erst diese Seiten, dann Bot und Oberfläche.
Nimmt die Oberfläche die neue Form noch nicht an, kommt ihre PR zuerst und
nimmt dann alte und neue an.

## Lokal

`web/serve.mjs` leitet jede Anfrage unter `/api/` an
`http://127.0.0.1:<API_PORT>` weiter, Standard 4174: Methode, Pfad mit
Query, Header und Body, und gibt Status, Header und Body unverändert
zurück, auch `Set-Cookie` und `Location`. Die Header aus `web/_headers`
gelten nur für die Dateien der Oberfläche. Antwortet der Bot nicht, gibt
`serve.mjs` `502` mit dem Body `{ "code": "nicht_erreichbar" }` zurück; die
Oberfläche behandelt das wie `503`. `API_PORT` steht in
[Anmeldung am Dashboard](anmeldung.md), „Umgebung“.

## Was noch fehlt

- Eine Grenze je IP-Adresse, vor allem für die Anmeldung. Hinter dem
  Reverse Proxy kommt jede Anfrage von `127.0.0.1`; die echte Adresse steht
  erst fest, wenn klar ist, wie der Proxy sie weitergibt.
- Server, auf denen der Bot fehlt, mit einem Link zum Einladen. Solange der
  Bot privat ist, geht der nur für das Team.
