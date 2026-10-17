---
title: API im Bot
description: Wie der Bot die API des Dashboards baut; Dateien, Seiten der Module, Start und Ende, welche Server in die Sitzung kommen, die Reihenfolge der Prüfungen, Grenzen und Zeitlimits im Prozess, Bilder und Vorschau, die Debug-Route, Fehler und Aufräumen.
code:
  - bot/src/api/server.ts
  - bot/src/api/anmeldung.ts
  - bot/src/kern/baukasten.ts
  - bot/src/kern/grenze.ts
  - bot/src/discord/eigentuemer.ts
  - bot/src/discord/kontext.ts
  - bot/src/discord/dashboard.ts
  - bot/src/discord/rechte.ts
  - bot/src/kern/aufraeumen.ts
  - bot/src/module/begruessung/seiten.ts
  - bot/src/module/begruessung/banner.ts
  - bot/src/module/sprachraeume/seiten.ts
  - bot/src/index.ts
  - bot/src/brett/brett.ts
---

# API im Bot

Was die API kann, steht im Vertrag: [API des Dashboards](../schnittstelle/api.md),
[Anmeldung am Dashboard](../schnittstelle/anmeldung.md) und
[Baukasten des Dashboards](../schnittstelle/baukasten.md). Diese Seite
sagt, wie das Backend ihn baut: mit `node:http` im Prozess des Bots, ohne
Paket dazu, siehe Entscheidung [0008](../entscheidungen/0008-api-im-bot-prozess.md).
Bilder und Banner zeichnet `@napi-rs/canvas`, siehe Entscheidung
[0009](../entscheidungen/0009-banner-mit-napi-rs-canvas.md).

## Dateien

| Datei | Inhalt |
|---|---|
| `bot/src/api/server.ts` | `erstelleApi`: Routen nach Zugang, Origin, Grenzen, Body; die Routen der Seiten aus den Bereichen der Module; dazu `apiUmgebung` |
| `bot/src/discord/dashboard.ts` | `DashboardGriff`: was die API von Discord braucht, mit eigenen Typen; die API sieht keinen Client. `dashboardGriff` baut ihn in `bot/src/index.ts` aus dem Client |
| `bot/src/discord/kontext.ts` | `verwaltet`: ob eine Person einen Server jetzt verwalten darf, und dann ihr `Kontext` |
| `bot/src/discord/rechte.ts` | `darfVerwalten`: die Rechte eines Servers aus der Anmeldung, siehe „Server der Sitzung“ |
| `bot/src/api/anmeldung.ts` | OAuth2 über `oauthUeber` in `bot/src/discord/oauth.ts`, Sitzungen in PostgreSQL, Cookies |
| `bot/src/discord/eigentuemer.ts` | `Berechtigte`: wer die Debug-Seite sehen darf, siehe „Debug“ |
| `bot/src/kern/baukasten.ts` | der Vertrag: Typen der Seiten und Bausteine, `Bereich`, `BausteinFehler` |
| `bot/src/kern/grenze.ts` | `Grenze`, das gleitende Fenster für alle Grenzen |
| `bot/src/discord/kanaele.ts` | `kanaele`: Text- und Ankündigungskanäle, in denen der Bot senden darf |
| `bot/src/module/begruessung/seiten.ts` | `begruessungsBereich`: die Seiten Beitritt und Abschied, Speichern, Bild, Vorschau, Testnachricht mit ihrer Grenze je Server |
| `bot/src/module/begruessung/begruessung.ts` | Standardwerte, `pruefe` mit den Regeln beim Speichern, Platzhalter, Lesen, Speichern und Löschen von Einstellungen und Bildern |
| `bot/src/module/begruessung/banner.ts` | `masse`, `bereiteVor` für ein hochgeladenes Bild, `zeichne` für das Banner |
| `bot/src/module/begruessung/senden.ts` | `banner` für Vorschau und Senden, `sendeTest` für die Testnachricht; `begruesse` und die Bremse, siehe [Begrüssung senden](begruessung-senden.md) |
| `bot/src/module/sprachraeume/seiten.ts` | `sprachraeumeBereich`: die Seite Sprachräume und ihr Speichern |
| `bot/src/module/sprachraeume/sprachraeume.ts` | `liste` mit Sprachkanälen und Kategorien, `pruefe` für das Speichern, siehe [Sprachräume im Bot](sprachraeume-bau.md) |

`bot/src/index.ts` gibt der API die Bereiche der Module, in der
Reihenfolge der Tabs. Die API kennt kein Modul; sie findet zu einer Seite
ihren Bereich über die IDs, die er anmeldet.

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

## Server der Sitzung

Bei der Anmeldung liest `liesPerson` in `bot/src/api/anmeldung.ts` die
Server der Person aus `GET /users/@me/guilds` und merkt sich in der
Sitzung die, die sie verwalten darf, siehe
[Anmeldung am Dashboard](../schnittstelle/anmeldung.md), „Ablauf“:

| Eintrag | in der Sitzung |
|---|---|
| `id` ist keine Zahl mit 1 bis 20 Ziffern | nein |
| `owner` ist `true` | ja |
| `permissions` hat „Server verwalten“ oder „Administrator“ | ja |
| `permissions` ist keine Dezimalzahl, etwa leer, negativ, hex oder Text | nein, wie ohne Recht |

Die Rechte prüft `darfVerwalten` in `bot/src/discord/rechte.ts`. Discord
liefert `permissions` als Text mit einer Dezimalzahl, siehe
[Permissions](https://docs.discord.com/developers/topics/permissions).
Ein Eintrag, der nicht passt, fällt weg, und die Anmeldung geht weiter;
so hält es auch eine falsche `id`. `BigInt` allein hätte bei Text geworfen
und die ganze Anmeldung scheitern lassen, und bei `0x20` hätte es hex
gelesen.

`GET /api/server` zeigt davon die Server, auf denen der Bot ist und die
Discord gerade liefert (`DashboardGriff#server`), sortiert nach Namen. Die
Rechte prüft jede Route mit `{id}` trotzdem neu, siehe „Ablauf einer
Anfrage“.

## Ablauf einer Anfrage

Jede Route hat einen Zugang. Er sagt, was `fuehreAus` in
`bot/src/api/server.ts` vor der Route prüft, und was die Route bekommt:

| Zugang | Routen | prüft vorher | die Route bekommt |
|---|---|---|---|
| `offen` | `/api/anmelden…` | nichts | `Anfrage` |
| `sitzung` | `/api/abmelden`, `/api/ich`, `/api/server`, `/api/debug` | Sitzung; mit `grenze` auch die Grenze je Sitzung | `MitSitzung`, mit `sitzung` |
| `server` | jede Route mit `{id}` | Sitzung, Grenze je Sitzung, mit `teuer` die für Bausteine, Rechte | `MitServer`, mit `sitzung` und `kontext` |

Eine Route liest nur, was ihr Zugang geprüft hat; sonst baut `tsc`
nicht. So braucht keine Route `a.sitzung!` oder eine Prüfung zur
Laufzeit.

Jede Anfrage durchläuft diese Schritte; sie hört beim ersten Fehler auf:

| Schritt | Für | Fehler |
|---|---|---|
| Route | alle; Seite, Baustein und Methode gehören zur Route | `404` `nicht_gefunden` |
| Origin | `PUT`, `POST`, `DELETE` | `403` `origin_falsch` |
| Sitzung | alle ausser `/api/anmelden…` | `401` `nicht_angemeldet` |
| Grenze | Routen mit `{id}` und `GET /api/debug`; `PUT`, `GET` und `POST` auf einen Baustein auch die für Bausteine | `429` `zu_viele` |
| Rechte | Routen mit `{id}`; `GET /api/debug` prüft in der Route, siehe „Debug“ | `404` `nicht_gefunden`, `503` `nicht_erreichbar`, `403` `kein_recht` |
| Modul an | jede Route unter `…/seiten/{seite}`; `GET …/seiten` lässt die Seiten ausgeschalteter Module weg | `409` `modul_aus` |
| Body | `PUT …/seiten/{seite}` | `415` `kein_json`, `413` `zu_gross` |
| Bereich | der Bereich der Seite: Regeln, Bild, Aktion | sein `BausteinFehler`, siehe [API der Begrüssung](../schnittstelle/begruessung.md) und [API der Sprachräume](../schnittstelle/sprachraeume.md) |

Ob ein Modul an ist, fragt die API `istAn` aus `ApiOptionen`, mit dem
Bereich und der ID des Servers. `bot/src/index.ts` ordnet dafür jedem
Bereich sein Modul zu und fragt das Board; der Bereich des Boards selbst
ist immer an. Die API kennt so weder Module noch Board, siehe
[Board der Module](../schnittstelle/module.md), „Im Bot“.

Für die Testnachricht prüft der Bereich der Begrüssung zuerst ihre Regeln,
dann die Grenze je Server und sendet erst danach; scheitert das Senden,
`503` `nicht_erreichbar`, siehe [Begrüssung senden](begruessung-senden.md),
„Testnachricht“.

Die Rechte prüft `verwaltet` in `bot/src/discord/kontext.ts`. Es gibt den
`Kontext` zurück oder den Grund, und die API macht daraus Status und Code:

| Grund | Antwort |
|---|---|
| `kein_server`: der Bot ist nicht auf dem Server | `404` `nicht_gefunden` |
| `nicht_erreichbar`: Discord liefert den Server gerade nicht (`available` falsch) | `503` `nicht_erreichbar`, ohne Logzeile und ohne nach dem Mitglied zu fragen |
| `kein_recht`: kein Mitglied, oder ohne „Server verwalten“ | `403` `kein_recht` |

Unknown Member (10007) und Unknown User (10013) von Discord werden
`DiscordFehler` mit `kein_mitglied` und so `kein_recht`. Jeder andere
Fehler beim Holen des Mitglieds wird `503` `nicht_erreichbar` mit
Logzeile, siehe „Fehler“. Der Cache von discord.js hält ohnehin keine
Mitglieder, siehe [Datenschutz](datenschutz.md), „Was der Bot speichert“;
`force: true` holt das Mitglied auch dann neu, wenn sich das einmal
ändert.

Wer Einstellungen oder ein Bild schreibt oder löscht, ruft danach
`delete` am Cache seines Moduls für den Server, siehe [Cache](cache.md),
„So geht es“. Jeder Bereich bekommt den Cache seines Moduls in dessen `modul.ts`.

## Grenzen und Zeitlimits

| Was | Wert | Wie |
|---|---|---|
| Anfragen mit `{id}` und `GET /api/debug` je Sitzung | 60 je Minute | `Grenze`: gleitendes Fenster im Speicher, Schlüssel ist der Hash der Sitzung |
| Anfragen auf einen Baustein je Sitzung | 20 je Minute | eine zweite `Grenze`, zusätzlich zur ersten |
| Testnachricht je Server | 3 je Minute | eine dritte `Grenze` im Bereich der Begrüssung, Schlüssel ist der Server; sie zählt erst nach Rechten und Regeln, sonst sperrte eine fremde Sitzung |
| JSON-Body | 16 KiB | zuerst `Content-Length`; sonst zählt das Lesen mit und hört an der Grenze auf |
| Bild | 4 MiB | wie beim JSON-Body |
| Header einer Anfrage | 10 s | `headersTimeout` |
| ganze Anfrage | 30 s | `requestTimeout` |
| ein Aufruf an Discord für OAuth2 | 10 s | `oauthFrist`: `signal` und ein Rennen, siehe [Rate-Limits](rate-limits.md), „Anmeldung“ |
| die Liste der Berechtigten für Debug | 5 min | `Berechtigte`, siehe „Debug“ |
| ein Avatar vom CDN | 5 s | `AbortSignal.timeout` in `holeAvatar` |

- Ihre Uhr ist `uhr` aus `ApiOptionen` und, für die Testnachricht, aus
  `BegruessungOptionen`, ohne Angabe `Date.now()`; Tests setzen eine
  eigene, um eine Minute vorzurücken.
- Die Grenzen leben im Speicher des Prozesses. Ein Neustart setzt sie
  zurück; eine zweite Instanz hätte ihre eigenen.
- Liegt bei der Antwort noch ungelesener Body an, schliesst die Verbindung
  danach (`Connection: close`), statt ihn zu Ende zu lesen.

## Bilder

`PUT …/seiten/{art}/bild` prüft und speichert in dieser Reihenfolge
(`ladeHoch` in `bot/src/module/begruessung/seiten.ts`, `bereiteVor` in
`bot/src/module/begruessung/banner.ts`):

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

`DELETE …/seiten/{art}/bild` löscht die Zeile und setzt `banner` auf
`false`, in einer Anweisung (`loescheBild`).

`GET …/seiten/{art}/vorschau` zeichnet das Banner wie beim Senden (`banner` in
`bot/src/module/begruessung/senden.ts`). Das Mitglied ist das aus der Prüfung der Rechte,
also mit Spitzname und Avatar auf diesem Server. Ohne Bild `404`
`kein_bild`. Die Vorschau zeichnet auch, wenn `banner` aus ist, damit das
Team sie vor dem Einschalten sieht.

## Debug

`GET /api/debug` und `Ich.debug` folgen
[API der Debug-Seite](../schnittstelle/debug.md).

- Die Route hat keinen Server. Sie braucht eine Sitzung und zählt zur
  Grenze von 60 je Sitzung (`grenze` an der Route), vor dem Prüfen der
  Rechte.
- Die Rechte prüft `Berechtigte#darf` in `bot/src/discord/eigentuemer.ts`
  mit `client.application.fetch()`: der Eigentümer, sonst die Mitglieder
  des Teams mit `membershipState` angenommen. Die Liste der IDs gilt
  einmal je Prozess höchstens 5 min, nach `uhr` aus `ApiOptionen`.
  Gleichzeitige Anfragen teilen sich einen Abruf; einen Fehlschlag hält
  sie nicht.
- Scheitert der Abruf, gibt `GET /api/debug` wie jeder andere Fehler
  `503` `nicht_erreichbar` mit der Zeile `API debug: <Fehler>`.
  `GET /api/ich` antwortet trotzdem, mit `debug: false` und der Zeile
  `API ich: Eigentümer nicht gelesen: <Fehler>`.
- Den Stand liefert `debugStand` aus der `Zaehlung` in `ApiOptionen`;
  ohne Angabe zählt eine eigene nur die Anfragen der API. Siehe
  [Rate-Limits](rate-limits.md), „Zählen“.

## Fehler

Ein erwarteter Fehler wird zu seinem Code aus dem Vertrag. Alles andere,
etwa ein Fehler der Datenbank oder ein `5xx` von Discord, wird `503`
`nicht_erreichbar` mit einer Logzeile `API <Route>: <Fehler>`. Was ins Log
darf, steht in [Datenschutz](datenschutz.md), „Was ins Log geht“.

## Aufräumen

- Abgelaufene Sitzungen löscht `raeumeAuf`, wenn die API öffnet, und dann
  jede Stunde.
- Die Daten von Servern, die der Bot verlassen hat, löscht `Aufraeumen` in
  `bot/src/kern/aufraeumen.ts`: `vergiss` bei `guildDelete`, `behalteNur`
  beim Start. Welche Tabellen das sind, sagt jedes Modul in `tabellen`,
  heute Einstellungen und Bilder der Begrüssung, Sprachräume und Räume,
  siehe [Struktur von Bot und Oberfläche](../entwicklung/struktur.md), „Ein
  Modul“, und [Begrüssung bei Beitritt und Abschied](../benutzung/begruessung.md),
  „Wenn etwas fehlt“.
- Beides löscht aus allen Tabellen in einer Anweisung mit CTEs, also in
  einer Transaktion. Die Namen der Tabellen kommen ins SQL; `Aufraeumen`
  prüft sie darum beim Bauen, vor dem Start des Bots: nur `a` bis `z`,
  Ziffern und `_`, höchstens 63 Zeichen, jede in genau einem Modul. Sonst
  startet der Bot nicht.
- Bei `guildDelete` vergisst jedes Modul zuerst seine Caches (`vergiss`),
  dann löscht `Aufraeumen` die Zeilen.
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
