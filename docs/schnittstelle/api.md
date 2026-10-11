---
title: API des Dashboards
description: Jede Route unter /api/, die der Bot dem Dashboard anbietet; Typen, Grenzen, Fehler und Statuscodes, die Weiterleitung von serve.mjs.
code:
  - bot/src/index.ts
  - bot/src/api.ts
  - bot/src/begruessung.ts
  - bot/src/banner.ts
  - web/serve.mjs
---

# API des Dashboards

Der Bot bietet dem Dashboard eine JSON-API unter `/api/`, in seinem eigenen
Prozess, siehe Entscheidung [0008](../entscheidungen/0008-api-im-bot-prozess.md).
Diese Seite ist der Vertrag zwischen `bot/` und `web/`: Was hier steht,
baut das Backend, und nur das nutzt das Frontend. Wer eine Route ändert,
ändert zuerst diese Seite. Anmeldung, Sitzung und Rechte stehen in
[Anmeldung am Dashboard](anmeldung.md), was Beitritt und Abschied auslösen,
in [Begrüssung bei Beitritt und Abschied](../benutzung/begruessung.md).

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
| `GET /api/server/{id}/kanaele` | `200` `Kanal[]` |
| `GET /api/server/{id}/begruessung` | `200` `{ beitritt: Einstellung, abschied: Einstellung }` |
| `PUT /api/server/{id}/begruessung/{art}` | `200` `Einstellung`, so wie gespeichert |
| `PUT /api/server/{id}/begruessung/{art}/bild` | `204` |
| `DELETE /api/server/{id}/begruessung/{art}/bild` | `204` |
| `GET /api/server/{id}/begruessung/{art}/vorschau` | `200` `image/png` |
| `POST /api/server/{id}/begruessung/{art}/test` | `204`; die Testnachricht ist gesendet |

`{art}` ist `beitritt` oder `abschied`, sonst `404`. Jede Route mit `{id}`
prüft zuerst die Rechte, siehe [Anmeldung am Dashboard](anmeldung.md),
„Rechte“. Den Ablauf der beiden Routen unter `/api/anmelden` beschreibt
[Anmeldung am Dashboard](anmeldung.md), „Ablauf“.

## Typen

```ts
type Ich = { id: string; name: string; avatar: string | null };
type Server = { id: string; name: string; icon: string | null };
type Kanal = {
  id: string;
  name: string;
  banner: boolean;
  kategorie: { id: string; name: string } | null;
};
type Einstellung = {
  an: boolean;
  kanal: string | null;
  text: string;
  banner: boolean;
  bannerText: string;
  bild: boolean; // nur lesen: ist ein Bild hochgeladen?
};
```

- `Ich.name` ist der Anzeigename bei Discord, sonst der Nutzername.
- `avatar` und `icon` sind volle URLs unter `https://cdn.discordapp.com/`
  mit `size=128`, oder `null`. 128 px reichen für 56 px auf einem
  Bildschirm mit doppelter Dichte. Die Oberfläche nutzt die URL, wie sie
  kommt.
- `GET /api/server` liefert die Server, auf denen die Person beim Anmelden
  „Server verwalten“ hatte und auf denen der Bot ist, nach Namen sortiert.
- Ein Server, auf dem der Bot fehlt oder den die Person nicht verwalten
  darf, steht nicht in der Liste. Ist sie leer, zeigt die Oberfläche einen
  leeren Zustand.
- `GET …/kanaele` liefert Text- und Ankündigungskanäle, in denen der Bot
  den Kanal sehen und Nachrichten senden darf. `banner` ist `true`, wenn er
  dort auch Dateien anhängen darf. `kategorie` ist die Kategorie, in der
  der Kanal steht, oder `null`; die Oberfläche kann danach gruppieren.
- Die Liste ist schon sortiert wie in Discord: Kanäle ohne Kategorie zuerst,
  dann die Kategorien nach ihrer Position; innerhalb einer Gruppe nach
  Position, bei gleicher Position nach ID. Die Oberfläche sortiert nicht
  um.
- Ohne gespeicherte Zeile liefert `GET …/begruessung` die Standardwerte,
  siehe [Begrüssung bei Beitritt und Abschied](../benutzung/begruessung.md),
  „Standardwerte“.
- `kanal` ist die gespeicherte ID, so wie sie ist, auch wenn es den Kanal
  nicht mehr gibt oder der Bot dort nicht mehr schreiben darf. Steht sie
  nicht in `GET …/kanaele`, zeigt die Oberfläche am Feld, dass ein neuer
  Kanal gewählt werden muss; Speichern mit ihr gibt `kanal_unbekannt`.

## Einstellung speichern

`PUT /api/server/{id}/begruessung/{art}` nimmt eine `Einstellung`. `bild`
darf fehlen und wird ignoriert; alle anderen Felder müssen da sein. Das
Backend prüft in dieser Reihenfolge und antwortet beim ersten Fehler mit
`400`, dem Code und dem Feld:

| Feld | Regel | Code |
|---|---|---|
| alle | jedes Feld ausser `bild` da, mit dem richtigen Typ; `text` und `bannerText` ohne NUL (`\0`), weil PostgreSQL es in Text nicht speichert | `ungueltig` |
| `kanal` | `null` oder ein Kanal aus `GET …/kanaele` | `kanal_unbekannt` |
| `text` | höchstens 2000 Zeichen, wenn jeder Platzhalter seinen längsten Wert im Text hat | `text_zu_lang` |
| `bannerText` | höchstens 100 Zeichen, wenn jeder Platzhalter seinen längsten Wert im Banner hat | `bannertext_zu_lang` |
| `banner` | `true` nur mit hochgeladenem Bild | `banner_ohne_bild` |
| `banner` | `true` nur mit einem Kanal mit `banner: true` | `banner_ohne_recht` |
| `an` | `true` nur mit `kanal` | `an_ohne_kanal` |
| `an` | `true` nur mit nicht leerem `text` oder `banner: true`; Leerzeichen allein zählen als leer | `an_ohne_inhalt` |

- Ist der Body kein JSON-Objekt, fehlt jedes Feld: `ungueltig` mit
  `feld` `an`.
- Ein Zeichen ist eine UTF-16-Einheit, also `String.length` in
  JavaScript. Ein Emoji zählt so oft zwei. Das ist nie weniger, als Discord
  zählt; ein Text, der hier passt, passt auch bei Discord.
- Die längsten Werte der Platzhalter, im Text und im Banner, stehen in
  [Begrüssung bei Beitritt und Abschied](../benutzung/begruessung.md),
  „Platzhalter“. Mit ihnen macht die Oberfläche dieselbe Rechnung vor dem
  Senden.
- 2000 Zeichen ist die Grenze von Discord für den Text einer Nachricht
  ([Create Message](https://docs.discord.com/developers/resources/message#create-message)).

## Bild

`PUT …/bild` nimmt das Bild roh als Body, nicht als Formular, und die
Oberfläche schickt die Datei so, wie sie gewählt wurde:

| Grenze | Wert | sonst |
|---|---|---|
| `Content-Type` | `image/png`, `image/jpeg` oder `image/webp` | `415` `bildtyp` |
| Grösse | höchstens 4 MiB, also 4 194 304 Byte | `413` `bild_zu_gross` |
| Pixel | höchstens 4096 px je Seite, mindestens 200 px je Seite | `413` `bild_zu_gross` oder `400` `bild_zu_klein` |
| lesbar | die Datei beginnt mit der Signatur von PNG, JPEG oder WebP, egal welcher `Content-Type`, und lässt sich dekodieren | `415` `bild_unlesbar` |

- Das Backend bricht ab, sobald der Body grösser als 4 MiB wird, statt ihn
  ganz zu lesen.
- Breite und Höhe liest es aus dem Kopf der Datei, bevor es dekodiert. So
  legt ein kleines Bild mit riesigen Massen den Bot nicht lahm.
- Jedes Seitenverhältnis geht; das Banner beschneidet mittig, siehe
  [Begrüssung bei Beitritt und Abschied](../benutzung/begruessung.md),
  „Banner“. Am schärfsten ist ein Bild mit 1100 × 440 px oder mehr.
- Ein neues Bild ersetzt das alte. `DELETE …/bild` löscht es und setzt
  `banner` auf `false`.

`GET …/vorschau` liefert das Banner so, wie der Bot es senden würde: mit dem
gespeicherten Stand und der angemeldeten Person als Mitglied. Ohne Bild
`404` `kein_bild`. Eine Query an `GET …/vorschau` wird ignoriert; die
Oberfläche hängt nach jedem Hochladen oder Speichern eine an, damit der
Browser das Bild neu lädt. Eine Vorschau vor dem Hochladen gibt es nicht; die
Oberfläche zeigt nach dem Hochladen die Vorschau. Damit reicht `img-src
'self'` für sie.

## Testnachricht

`POST …/test` schickt die Begrüssung einmal in den gespeicherten Kanal, so
wie der Bot sie bei einem Ereignis schicken würde: mit dem gespeicherten
Stand und der angemeldeten Person als Mitglied, wie bei der Vorschau. Die
Route hat keinen Body.

- Sie geht auch, wenn `an` aus ist. So lässt sich vor dem Einschalten
  probieren.
- Sie pingt niemanden, auch nicht mit `{nutzer}` beim Beitritt:
  `allowed_mentions` ist leer.
- Vor dem Text steht die Zeile `-# Testnachricht aus dem Dashboard`, in
  Discord als kleiner, grauer Untertext
  ([Markdown in Discord](https://support.discord.com/hc/en-us/articles/210298617)).
  Wird die Nachricht damit länger als 2000 Zeichen, fällt die Zeile weg.
- Banner und fehlende Rechte gelten wie beim echten Senden, siehe
  [Begrüssung bei Beitritt und Abschied](../benutzung/begruessung.md),
  „Wenn etwas fehlt“: Ohne „Dateien anhängen“ geht nur der Text.
- Die Bremse gilt für Testnachrichten nicht; sie haben die Grenze unten.

Das Backend prüft in dieser Reihenfolge und antwortet beim ersten Fehler
mit `400`, dem Code und dem Feld:

| Regel | Code | Feld |
|---|---|---|
| ein Kanal ist gespeichert | `test_ohne_kanal` | `kanal` |
| der gespeicherte Kanal steht in `GET …/kanaele` | `kanal_unbekannt` | `kanal` |
| es gibt etwas zu senden: Text, der nicht nur aus Leerzeichen besteht, oder ein Banner, das der Bot im Kanal anhängen darf | `test_ohne_inhalt` | `text` |

Scheitert das Senden bei Discord, `503` `nicht_erreichbar`.

## Grenzen je Sitzung

| Was | Höchstens | Warum |
|---|---|---|
| alle Routen mit `{id}` zusammen | 60 je Minute und Sitzung | jede prüft die Rechte mit einem Aufruf an Discord; eine Sitzung soll nicht das Budget des Bots verbrauchen, das er für Interaktionen braucht |
| `PUT …/bild`, `GET …/vorschau` und `POST …/test` zusammen | 20 je Minute und Sitzung | sie dekodieren oder zeichnen Bilder |
| `POST …/test` | 3 je Minute und Server, über alle Sitzungen | jede Testnachricht landet im Kanal, den alle sehen |

Darüber `429` `zu_viele` mit `Retry-After` in Sekunden. Die Grenze wird vor
den Rechten geprüft, damit eine abgelehnte Anfrage Discord nichts kostet.
Ein Aufruf zählt zu jeder Zeile, die passt.

## Fehler

Jeder Fehler hat den Body `{ "code": "<code>", "feld": "<Feld>" }`. `code`
ist fest und maschinenlesbar; welchen Satz die Oberfläche dazu zeigt,
entscheidet das Frontend. `feld` steht nur bei `400`.

| Status | Code | Wann |
|---|---|---|
| `400` | siehe „Einstellung speichern“ und „Testnachricht“ oben, dazu `bild_zu_klein` | Eingabe ungültig, oder für eine Testnachricht fehlt etwas |
| `401` | `nicht_angemeldet` | keine oder abgelaufene Sitzung; die Oberfläche zeigt die Anmeldung |
| `403` | `kein_recht` | kein „Server verwalten“ auf diesem Server |
| `403` | `origin_falsch` | `Origin` fehlt oder passt nicht |
| `404` | `nicht_gefunden` | Route, Server oder `{art}` unbekannt, oder der Bot ist nicht auf dem Server |
| `404` | `kein_bild` | Vorschau ohne Bild |
| `413` | `zu_gross`, `bild_zu_gross` | Body zu gross, Bild zu gross |
| `415` | `kein_json`, `bildtyp`, `bild_unlesbar` | JSON ohne `Content-Type: application/json`, Bild mit falschem Typ oder nicht lesbar |
| `429` | `zu_viele` | siehe „Grenzen je Sitzung“, mit `Retry-After` |
| `503` | `nicht_erreichbar` | Discord oder die Datenbank antwortet nicht |

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
