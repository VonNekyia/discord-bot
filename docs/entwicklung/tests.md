---
title: Tests
description: Wie die Tests des Bots laufen, was die gemockte Discord-API kann und was abgedeckt ist.
code:
  - bot/src/module/befehle/befehle.test.ts
  - bot/src/discord/befehle.test.ts
  - bot/src/kern/cache.test.ts
  - bot/src/kern/datenbank.test.ts
  - bot/src/kern/eingabe.test.ts
  - bot/src/kern/aufraeumen.test.ts
  - bot/src/modulliste.test.ts
  - bot/src/api/server.test.ts
  - bot/src/module/begruessung/begruessung.test.ts
  - bot/src/module/begruessung/banner.test.ts
  - bot/src/module/begruessung/glyphen.test.ts
  - bot/src/kern/namen.test.ts
  - bot/src/discord/client.test.ts
  - bot/src/module/begruessung/senden.test.ts
  - bot/src/testhilfe.ts
  - bot/src/module/sprachraeume/sprachraeume.test.ts
  - bot/src/module/sprachraeume/knoepfe.test.ts
  - bot/src/module/sprachraeume/raumrechte.test.ts
  - bot/src/kern/zaehlung.test.ts
  - bot/src/discord/zaehlen.test.ts
  - bot/src/discord/oauth.test.ts
  - bot/src/discord/nachrichten.test.ts
  - bot/src/discord/fehler.test.ts
  - bot/src/discord/sprachkanaele.test.ts
  - bot/src/discord/menue.test.ts
  - bot/src/discord/rechte.test.ts
  - bot/src/discord/dashboard.test.ts
  - bot/package.json
  - .github/workflows/backend.yml
  - bot/src/discord/modul.test.ts
---

# Tests

Die Tests laufen mit `node --test`, ohne Testframework, gegen eine
gemockte Discord-API auf `127.0.0.1` und, wo es um SQL geht, gegen eine
echte PostgreSQL. Kein Test braucht einen Token oder das Netz.

```bash
cd bot
npm test
```

`npm test` baut mit `npm run build` nach `bot/dist/` und startet
`node --test dist/**/*.test.js`. `build` leert `bot/dist/` vorher mit
`fs.rmSync` aus Node, ohne `rm`, damit es auch unter Windows geht: `tsc`
löscht keine alten Ausgaben, und eine Testdatei, die es in `src/` nicht
mehr gibt, liefe sonst mit. Gibt es `bot/.env`, liest `npm test` sie mit
`--env-file-if-exists`; kein Test gibt die Umgebung aus.

## Die gemockte API

`mockApi` in `bot/src/discord/befehle.test.ts` startet einen `node:http`-Server
auf einem freien Port und gibt ein `REST` zurück, dessen `api` auf ihn
zeigt. Er antwortet der Reihe nach mit den Statuscodes, die der Test
vorgibt, danach mit 200, und merkt sich jede Anfrage mit Methode, Pfad
und Body. Ein 429 kommt mit `Retry-After: 0`.

Slash-Befehle ruft `ruft` in derselben Datei so auf, wie Discord sie
schickt: durch die Action `InteractionCreate` eines eigenen Clients aus
`discordClient`, die Antworten gehen an `mockDiscord`. Die Befehle des
Moduls prüft `bot/src/module/befehle/befehle.test.ts` ohne Discord, mit
einem `Aufruf`, der nur die Antworten sammelt.

## Die API des Dashboards

`bot/src/api/server.test.ts` startet die API mit `erstelleApi` und den
Bereichen von Begrüssung und Sprachräumen auf einem freien Port und
spricht sie mit `fetch` an, ohne Weiterleitungen zu folgen.
`bot/src/module/begruessung/senden.test.ts` ruft `begruesse` mit einer
Fälschung der Discord-Schicht: ein `Mitglied` als Objekt und ein
`Textkanal`, der sich merkt, was er senden soll; ohne Client und ohne
Netz. Darum laufen die 30 s der Bremse dort mit `t.mock.timers`, siehe
„Falsche Uhren“. Die Schicht selbst prüft `bot/src/discord/nachrichten.test.ts`
gegen `mockDiscord`. Die Tests der API und der Schicht nutzen
`bot/src/testhilfe.ts`:

- `mockDiscord`: ein `node:http`-Server für OAuth2 (`/oauth2/token`,
  `/oauth2/token/revoke`, `/users/@me`, `/users/@me/guilds`), für
  `GET /guilds/{id}/members/{user}`, für `POST /channels/{id}/messages`,
  auch mit Dateien, für das CDN der Avatare, für Kanäle anlegen, ändern
  (`PATCH /channels/{id}`) und löschen, für Mitglieder verschieben und für
  die Antworten auf Interaktionen (`POST /interactions/{id}/{token}/callback`,
  `PATCH /webhooks/{id}/{token}/messages/@original`, `POST /webhooks/{id}/{token}`
  für `followUp`). Er merkt sich jede
  Anfrage, Nachricht, Anlage, Änderung mit dem Grund im Audit-Log,
  Verschiebung, Löschung und Antwort; je Test lässt sich die Antwort für
  Person und Mitglieder ändern, Anlegen, Ändern, Verschieben, Löschen und
  Senden können mit einem Code von Discord scheitern, mit `antwortFehler`
  auch jede Antwort auf eine Interaktion, und Umbenennen kann mit 429
  und `Retry-After` antworten. Mit `tauschWarten` antwortet
  `POST /oauth2/token` mit 429 und den Sekunden in `Retry-After`, einmal je
  Eintrag. `GET /applications/@me` liefert `anwendung`: eine Anwendung aus
  `anwendungDaten`, mit `EIGENTUEMER` oder einem Team, oder einen Status
  für einen Fehler.
- `bot/src/module/sprachraeume/sprachraeume.test.ts` setzt Voice States über den Cache von
  discord.js, wie Discord sie meldet, und ruft dann `Raeume#aenderung`.
  Es nutzt einen eigenen Server und eine eigene Person, weil die
  Testdateien gleichzeitig laufen.
- `discordClient`: ein Client aus `erstelleClient` ohne Gateway, dessen
  REST und CDN auf den Mock zeigen. Die Server legt er so in den Cache, wie
  `GUILD_CREATE` sie bringt, mit Rollen, Kanälen und dem Bot als Mitglied.
  So rechnet discord.js Rechte und Kanäle selbst.
- `roh`: schickt rohe Bytes über `node:net`, für Bodies, die nie enden.
- `pngKopf`, `pngBild`, `jpegMitExif`: ein PNG nur mit Kopf, ein ganzes PNG
  und ein JPEG mit EXIF-Drehung, Beschreibung und GPS.

Die Tests brauchen PostgreSQL wie die in „Tests gegen PostgreSQL“ und
wenden vorher die Migrationen aus `bot/migrationen/` an. Ihre Sitzungen,
Einstellungen und Bilder fallen danach weg; jede Datei nutzt eigene
Server. Wer `behalteNur` testet, tut das in einer Transaktion, die
zurückrollt, weil die Dateien gleichzeitig laufen. Alle IDs sind erfunden
(`AGENTS.md`, Regel 21).

## Das Menü der Sprachräume

`bot/src/module/sprachraeume/knoepfe.test.ts` baut Interaktionen so, wie Discord sie schickt,
und gibt sie durch die Action `InteractionCreate` von discord.js. So
entstehen echte `ButtonInteraction`, `UserSelectMenuInteraction` und
`ModalSubmitInteraction`, und `deferReply`, `showModal` und
`editReply` gehen als REST an `mockDiscord`. Den Stand des Raums setzt
der Test mit der Action `ChannelUpdate`, wer drin ist, über die Voice
States. Die Datei nutzt einen eigenen Server und eigene Personen. Jeder
Test baut in `beforeEach` einen eigenen Client mit `discordClient`: Cache
und REST fangen frisch an, und kein Test hängt an den Rate-Limits eines
anderen, auch nicht am globalen Limit von 50 Anfragen je Sekunde.
`bot/src/module/sprachraeume/raumrechte.test.ts` prüft die Rechnung der Rechte ohne Discord.

## Rate-Limits zählen

`bot/src/kern/zaehlung.test.ts` prüft `Zaehlung` und `route` ohne Netz;
das Fenster von 10 min und die Warnung mit `t.mock.timers` und falschem
`Date`. `bot/src/discord/zaehlen.test.ts` und `bot/src/discord/oauth.test.ts`
starten je Test einen kleinen `node:http`-Server, der je Pfad zuerst ein
429 mit den Headern des Tests schickt, nie antwortet oder immer 429 gibt,
und hängen `zaehleAnfragen` oder `oauthUeber` an den REST eines Clients
aus `erstelleClient`. `bot/src/api/server.test.ts` zählt wie im Bot mit
und prüft dort die Anmeldung und die eigenen Grenzen.

## Falsche Uhren

Mit `t.mock.timers` laufen `setTimeout` und `Date` für den ganzen
Prozess falsch, auch in REST von discord.js, `fetch` und undici. Ein Test,
der dabei Discord fragt, hängt oder wird langsam: Mit falschem
`setTimeout` brauchte ein `PATCH` an den Mock gemessen 6 s statt weniger
Millisekunden. Darum:

- Ohne Netz geht `t.mock.timers`, etwa für die Bremse, auch beim Senden
  gegen eine Fälschung der Discord-Schicht, oder die Zählung der
  Rate-Limits.
- Mit Netz bekommt der Code eine eigene falsche Uhr: `uhr` für Zeiten und
  `planen` für Timer in `RaumKontext` (`bot/src/module/sprachraeume/raeume.ts`).
  Der Test lässt die Zeit selbst vorrücken.
- Echte kurze Zeiten nur, wo der Test auf das Ende wartet, etwa `warten`
  vor dem Löschen eines leeren Raums; nie eine Wartezeit, die gegen die
  Dauer anderer Aufrufe läuft.

## Was abgedeckt ist

| Test | prüft |
|---|---|
| registriere ersetzt alle Befehle mit einem PUT | Methode, Pfad, der Body je Befehl wie von `SlashCommandBuilder`: Name, Beschreibung, keine Optionen, Typ 1 |
| registriere wartet nach 429 | genau ein zweiter Versuch |
| registriere gibt nach 5xx auf | der Fehler kommt beim Aufrufer an |
| registriere wirft bei einem Namen, den Discord nicht nimmt … | Grossbuchstaben und Leerzeichen: Fehler, keine Anfrage |
| ein Befehl antwortet gleich, nur dem Nutzer und ohne Erwähnungen | Typ 4, Flag `Ephemeral` (64), `allowed_mentions` mit leerem `parse`; keine Logzeile |
| ein unbekannter Befehl … | Meldung an den Nutzer, eine Logzeile ohne Nutzerdaten |
| wirft ein Befehl nach seiner Antwort … | die Meldung als `followUp` (`POST /webhooks/{id}/{token}`), ephemeral; eine Logzeile |
| scheitert die Antwort, wirft antworte DiscordFehler … | Callback mit 404 und 10062: der Befehl sieht `DiscordFehler` mit `anderes`; zwei Logzeilen ohne Token und ID |
| befehle: nur /ping, mit Beschreibung | Name und Beschreibung, wie Discord sie zeigt |
| /ping antwortet mit der Zeit der Datenbank | Text mit ms |
| /ping antwortet auch, wenn die Datenbank fehlt | „nicht erreichbar“, eine Logzeile nur mit dem Fehlertext |
| /ping antwortet nach 2 s, wenn die Datenbank hängt | eine `query`, die nie zurückkommt; mit falschen Uhren: bei 1999 ms noch keine Antwort, bei 2000 ms „nicht erreichbar“ |
| gleichzeitige Anfragen laden einen Schlüssel nur einmal | `ladeCache` |
| nach delete und nach Ablauf wird neu geladen | `ladeCache` mit `ttl` 30 ms |
| mehr als max Schlüssel verdrängen den ältesten | `ladeCache` mit `max` 2 |
| verbindung braucht Host, Name, Nutzer und Passwort | `verbindung`, Standardport 5432 |
| migriere wendet jede Datei genau einmal an … | PostgreSQL: Reihenfolge nach Namen, zweiter Lauf leer, `bigint` über 2^53 als Text |
| eine Migration gilt ganz oder gar nicht … | PostgreSQL: Datei und Eintrag haben dieselbe `xmin`, liefen also in einer Transaktion; ohne die Transaktion je Datei fällt der Test. Nach einem Fehler keine halbe Datei und kein Eintrag, nach der Korrektur läuft sie |
| zwei gleichzeitige Läufe von migriere … | PostgreSQL: die erste Datei schläft 0,5 s; ein Lauf wendet beide Dateien an, der andere keine. Ohne die Sperre scheitert der zweite an `CREATE TABLE` |
| der Pool überlebt, wenn die Datenbank eine freie Verbindung trennt | PostgreSQL: `pg_terminate_backend`; genau eine Logzeile `Datenbank: …`, die nächste Anfrage geht |
| misse misst eine Anfrage an die Datenbank | PostgreSQL: `SELECT 1` |
| der Cache hält Mitglieder und Nutzer nur für den Bot selbst | `erstelleClient`: nach `GUILD_CREATE` mit drei Mitgliedern nur der Bot in beiden Caches |
| ein 429 mit Headern gibt genau eine Logzeile ohne ID und Token … | gegen den Mock: zuerst 429 mit `Limit`, `Remaining`, `Reset-After`, dann 200; genau eine Zeile `Rate-Limit: 429 bei POST /channels/:id/messages, …`; zwei Anfragen, ein 429, die Header der letzten Antwort, `user`, ein ungültiger |
| Tokens von Interaktionen und Webhooks stehen weder im Stand noch im Log … | Callback mit 429 `shared`, `@original` mit 429 `global`: Routen mit `:token`, `global` 1, `shared` zählt nicht als ungültig; kein Token und keine ID in Stand und Log |
| ein Aufruf trägt den eigenen Authorization-Header, nicht den Token des Bots | `oauthUeber`: alle rohen Header `Authorization` der Anfrage, nur `Bearer` der Person |
| antwortet Discord nicht, scheitert der Aufruf nach der Frist | Frist 200 ms: „Person: Frist abgelaufen“ |
| die Frist gilt auch, während @discordjs/rest ein Retry-After abwartet | Antwort nach 400 ms, 429 mit `Retry-After: 0.8`, Frist 1 s: Fehler nach 0,9 bis 1,2 s, eine Anfrage |
| ein globales 429 der Anmeldung bremst den Bot nicht … | `Retry-After: 60` mit `X-RateLimit-Global`: die Anmeldung scheitert gleich, danach geht `GET /gateway` des Bots unter 1 s; die Zählung hat das 429 als `global` |
| Route ohne IDs und Tokens | `route`: Zahlen, Tokens nach `webhooks` und `interactions`, `%40original`, Query, unbekannte Segmente |
| ohne Antworten: alle vier eigenen Grenzen mit 0 … | `stand` mit falscher Uhr: `seit`, `jetzt`, leere Routen, `warnung` 1000, `grenze` 10000 |
| je Methode und Route: Anfragen, 429, die letzten Header … | Methode gross, nach Anfragen sortiert, `global` und Scopes, `griff`; ein Stand ändert sich danach nicht |
| ungültig sind 401, 403 und 429, nicht 429 mit Scope shared … | 404 und 500 zählen nicht; nach 10 min − 1 ms noch drei, nach 10 min keiner |
| die Warnung kommt einmal beim Erreichen von 1000 … | 999 ohne, die 1000. mit genau einer Zeile, 500 weitere ohne; nach 10 min und wieder 1000 die zweite |
| je 429 genau eine Logzeile … | Webhook mit Token: die Zeile mit `:token`, kein Token im Stand |
| nur PATCH /channels/:id wartet nicht auf ein Rate-Limit … | je Route zuerst 429 mit `Retry-After: 0`: `PATCH /channels/:id` wirft `RateLimitError` ohne zweiten Versuch, `POST /channels/:id/messages` und `DELETE /channels/:id` versuchen es noch einmal |
| auf das globale Limit von @discordjs/rest wartet auch PATCH /channels/:id | `globalRequestsPerSecond: 1`: zwei `PATCH /channels/:id` nacheinander, beide gehen durch |
| ein 429 beim Umbenennen wirft auch, wenn die Anfragen der Sekunde verbraucht sind | `globalRequestsPerSecond: 1`, 429 mit `Retry-After: 300`: `RateLimitError` mit `global` und 300 050 ms unter 2 s, eine Anfrage |
| hoechstens rechnet jeden Platzhalter … | längste Werte im Text und im Banner, Emoji zählt zwei |
| der Text darf mit den längsten Werten genau 2000 Zeichen haben … | Grenze genau, ein Zeichen mehr gibt den Code |
| jede Prüfregel meldet ihren Code und ihr Feld | `pruefe`: jede Zeile der Tabelle „Einstellung speichern“ |
| die Regeln gelten in der Reihenfolge der Tabelle | bei mehreren Fehlern der erste |
| ungültige Typen meldet pruefe in der Reihenfolge an, kanal, text, banner, bannerText | alle fünf falsch, dann eins nach dem anderen richtig: jedes Mal das nächste Feld, am Ende gültig |
| eine gültige Einstellung kommt so zurück … | `bild` aus dem Stand, nicht aus der Eingabe |
| ein Name mit Emoji, Kanji und Hangul zeigt kein Kästchen | jedes Zeichen einzeln mit dem Schriftstapel gezeichnet, hat Tinte und ist nicht das Glyph für ein fehlendes Zeichen (`U+0378`); dass der Vergleich ein Kästchen erkennt, zeigt `😀` mit Inter allein |
| ein Banner mit Emoji und CJK im Namen hat 1100 × 440 px | `zeichne` mit dem Stapel |
| ein Banner mit „𝕿𝖊𝖘𝖙“ ist Pixel für Pixel das Banner mit „Test“ … | `zeichne` mit Zierbuchstaben gleich `zeichne` mit „Test“; Arabisch ohne Glyphe fällt weg, auch der doppelte Leerraum |
| zeichenbar: Zierbuchstaben ohne Glyphe werden nach NFKC zu Buchstaben … | `bot/src/module/begruessung/glyphen.test.ts`: 𝕿, 𝔗 und 𝓣 werden T; die Pixel gleich „Test“, ungeändert nicht |
| zeichenbar: was eine Schrift hat, bleibt … | Ｔ, Ⓣ, ﬁ, Emoji mit ZWJ, Hautton, Flaggen samt Tag-Flagge, Taste, Kanji, Hangul: Zeichen für Zeichen gleich |
| zeichenbar: ohne Glyphe und ohne Ersatz fällt ein Zeichen weg … | U+16CB, Arabisch, Devanagari mit Vokalzeichen (Mn), U+0378 fallen weg; ZWJ, U+200F, U+2066, VS16 bleiben |
| unsichtbare Zeichen zeichnet das Banner nicht … | neun Default Ignorables zwischen A und B: dieselben Pixel wie „AB“ |
| die cmap sagt dasselbe wie das Zeichnen … | 16 Zeichen: Glyphe nach der `cmap` genau dann, wenn das Zeichnen Tinte und kein Kästchen ergibt |
| Glyphen legt die Bereiche der Schriften zusammen … / bereicheAus liest Format 12 … | Bereiche über drei Schriften; Glyphe 0 am Anfang einer Gruppe zählt nicht; nur Format 4 oder Format 12 für 3/1 wirft |
| leseBereiche wirft beim Laden für eine Schrift ohne cmap im Format 12 … | eine gebaute Datei mit `cmap` nur im Format 4 und eine ohne `cmap`: Fehler mit dem Dateinamen |
| maskiere setzt vor jedes ASCII-Satzzeichen genau einen Backslash | Markdown, Erwähnung, Emoji; höchstens doppelt so lang; Umlaute, CJK und Emoji bleiben |
| ersetze maskiert im Text, lässt das Banner roh … | `<@…>` im Text, `@Name` im Banner; unbekannte Platzhalter bleiben; ein eingesetztes `{server}` bleibt stehen |
| apiUmgebung braucht Secret und Adresse des Dashboards | ohne eins keine API, Standardport, falsche Adresse oder Port beendet den Start |
| Grenze lässt 60 Anfragen je Minute zu … | mit falscher Uhr: 61. Anfrage, Sekunden bis zur nächsten, gleitendes Fenster |
| erstelleApi weist doppelte, zu viele und ungültige Seiten ab | eine ID doppelt, 7 Seiten, `a/b` als ID, eine `aktion` ohne `loeseAus`; mit `loeseAus` startet sie |
| anmelden setzt ein state-Cookie und leitet zu Discord | Parameter der Weiterleitung, Cookie mit `HttpOnly`, `SameSite=Lax`, ohne `Secure` bei http |
| ohne state-Cookie oder mit falschem state … | Weiterleitung mit Fehler, keine Anfrage an Discord |
| bei 429 wartet die Anmeldung ein kurzes Retry-After ab … | `Retry-After: 0`: zweimal `POST /oauth2/token`, dann Erfolg; alle vier Routen zählen mit, eine Zeile `Rate-Limit: 429 bei POST /oauth2/token, …` |
| verlangt Discord länger als die Frist, scheitert die Anmeldung gleich … | `Retry-After: 60`: unter 2 s `?fehler=anmeldung`, ein Aufruf; Log nur „Anmeldung: Tausch: Discord antwortet 429, Retry-After 60 s“ und die Zeile der Zählung, ohne Code, Token, state und ID |
| die Anmeldung tauscht den Code, widerruft den Token … | Reihenfolge der Aufrufe, Basic-Auth, Widerruf mit dem Token, in der Datenbank nur der SHA-256, nur verwaltbare Server, 7 Tage; danach `ich` und `server`. Ein Server mit `permissions` `viel` fällt weg, die Anmeldung gelingt |
| darfVerwalten: „Server verwalten“ oder „Administrator“ … | `bot/src/discord/rechte.test.ts`: beide Rechte, andere Rechte, `0`, mehr als 64 Bit; leer, Text, Leerzeichen, negativ, hex und `32.0` heissen nein, ohne zu werfen |
| server: nur Server mit Bot, die Discord gerade liefert … | `DashboardGriff#server`: ein Server ohne `available` und eine unbekannte ID fallen weg, die Reihenfolge der IDs bleibt, das Icon mit `size=128` |
| der Token wird auch widerrufen, wenn das Lesen der Person scheitert | Widerruf als letzter Aufruf, keine Sitzung, eine Logzeile |
| mit https tragen die Cookies Secure | `Secure` hinten am Cookie |
| abmelden braucht den Origin des Dashboards … | ohne und mit falschem Origin `403`, sonst `204`, Cookie gelöscht, danach `401` |
| eine abgelaufene Sitzung gilt nicht … | `401`, `raeumeAuf` löscht die Zeile |
| Bot nicht auf dem Server gibt 404 … | `404` ohne Aufruf an Discord, Unknown Member `403`, Recht entzogen `403`, Eigentümer ohne Rolle darf |
| liefert Discord den Server gerade nicht, gibt es 503 … | `available` falsch: `503` `nicht_erreichbar`, kein Abruf des Mitglieds, keine Logzeile |
| der Eigentümer der Anwendung sieht Debug, jeder andere bekommt 403 | `Ich.debug` true und false; `/api/debug` `200` mit allen Feldern von `Debug`, `shards` `[0]`, den vier eigenen Grenzen und `GET /applications/@me` in den Routen; `403` `kein_recht`, ohne Sitzung `401` |
| die Antwort trägt weder IDs noch Tokens … | nach Anmeldung, Mitgliedern und Anwendung: Routen mit `:id`, keine Zahl mit 17 Stellen, kein Token, Code oder Secret |
| ein Team: Mitglieder mit angenommener Einladung sehen Debug … | `membership_state` 2 darf, 1 nicht, auch nicht `/api/debug` |
| die Liste der Berechtigten gilt 5 min, einmal für alle | zwei Personen, ein Abruf; neuer Eigentümer bei Discord: nach 5 min − 1 ms noch der alte, nach 5 min der neue, zweiter Abruf |
| scheitert das Lesen der Anwendung … | `500`: `/api/ich` `200` mit `debug: false`, `/api/debug` `503`; danach ohne Vorrücken `200`, drei Abrufe; Logzeilen `API ich` und `API debug` ohne ID |
| GET /api/debug zählt zur Grenze von 60 … | 59 `/api/debug` und eine Route mit `{id}`, die 61. `429` mit `Retry-After`; `sitzung` zählt eins mehr |
| nach 60 Anfragen je Minute kommt 429 … | `Retry-After` 1 bis 60, die 61. Anfrage fragt Discord nicht; `sitzung` zählt eins mehr |
| antwortet Discord nicht, gibt es 503 … | eine Logzeile mit dem Namen der Route, ohne ID |
| seiten liefert Beitritt, Abschied und Sprachräume … | Reihenfolge der Seiten und ihrer Bausteine, die Vorschau daneben; Optionen des Kanals: ohne Kategorie zuerst, Kategorien und Kanäle nach Position, bei gleicher nach ID; ohne Sehen keine Option, ohne Anhängen kein Merkmal `banner` |
| eine Seite liefert Standardwerte, speichert … | Standardwerte in `wert`, `PUT` mit `meldung`, Cache der Einstellungen für den Server geleert, wieder lesen |
| Speichern prüft Origin, Content-Type und Regeln | `403`, `415`, kaputtes JSON, Regeln mit Code und Feld |
| ein Body über 16 KiB gibt 413, ohne ihn ganz zu lesen | `Content-Length` zu gross ohne Body; chunked ohne Ende; danach `Connection: close` |
| verlässt der Bot einen Server, gehen Einstellungen und Bilder … | `Aufraeumen` aus `alleModule`: `vergiss` und `behalteNur` für beide Tabellen |
| mit dem ShardingManager gleicht ein Prozess nur … | Shard 1 von 2: der Server auf Shard 0 bleibt |
| unbekannte Routen, Seiten, Bausteine und Methoden geben 404 … | eine unbekannte Seite, `GET` auf eine Seite, `POST` und `GET` auf `…/bild`, `PUT` auf `…/test`, ein Baustein einer anderen Seite; kein Aufruf an Discord |
| was der gespeicherte Stand nicht mehr besteht, steht als fund … | ein Kanal ohne Recht gibt `kanal_unbekannt` an `kanal`; der Standard gibt `null` |
| ein Bild wird geprüft, bevor es dekodiert wird | `bildtyp`; ein PNG nur mit Kopf und 20000 × 20000 px gibt `bild_zu_gross`, nicht `bild_unlesbar`; zu klein, kein Bild; SVG und GIF unter `image/png` geben `bild_unlesbar` an der Signatur |
| ein Bild über 4 MiB gibt 413, ohne es zu lesen | `Content-Length` über 4 MiB ohne Body |
| ein JPEG mit GPS wird gedreht … | WebP mit 1100 × 440, ohne `Exif`, ohne Beschreibung; Drehung 6 an den Farben; danach `bild: true`, `banner_ohne_recht` |
| Vorschau: 404 ohne Bild, sonst ein PNG … | `kein_bild`, PNG mit 1100 × 440, Avatar vom CDN; `DELETE` löscht Bild und `banner` |
| Bild und Vorschau zusammen höchstens 20 je Minute … | die 21. Anfrage `429` ohne Aufruf an Discord; `seiten` geht weiter; `bausteine` zählt eins mehr |
| die Regeln der Testnachricht gelten in ihrer Reihenfolge | `test_ohne_kanal`, `kanal_unbekannt`, `test_ohne_inhalt` mit Leerzeichen, ohne Bild und im Kanal ohne „Dateien anhängen“; keine Nachricht |
| die Testnachricht geht auch, wenn an aus ist … | `200` „Gesendet.“ mit dem Kanal, Zeile `-# Testnachricht aus dem Dashboard` vorn, `allowed_mentions` leer trotz `{nutzer}` |
| würde die Nachricht mit der Zeile länger als 2000 Zeichen … | bei 1990 Zeichen Text geht nur der Text |
| mit Banner heisst sie „Gesendet.“ … | Datei `beitritt.png`, nur die Zeile als Text; im Kanal ohne Dateien „Gesendet, ohne Banner.“ und keine Datei |
| ist der Text leer und scheitert das Banner … | `503`, keine Nachricht |
| die Grenze je Server zählt erst nach den Rechten … | fünfmal `403` für eine fremde Sitzung, danach dreimal `200` und `429` mit `Retry-After: 60`; `testnachricht` zählt eins mehr |
| kein Code, Token, Cookie, state und keine ID im Log | Anmeldung mit Erfolg und drei Fehlern, eine Route mit `503`; keine Zeile enthält einen der Werte |
| ein Erzeuger legt den Raum … in einem Aufruf an | eine private Kategorie: Name aus der Vorlage, Kategorie, Limit; die Einträge der Kategorie, @everyone ohne „Kanal ansehen“, der Besitzer zusammengeführt, der Bot; verschoben mit Grund; Zeile in `raeume` |
| raumname: ohne Hasszeichen aus Name und Vorlage … | U+5350 im Namen und in der Vorlage fällt, SS-Runen gemischt fallen, ein einzelnes U+16CB bleibt; Name nur aus Hakenkreuzen: Benutzername; Vorlage nur aus Hakenkreuz: der Name; höchstens 100 Zeichen |
| ein neuer Raum heisst ohne Hasszeichen … | `global_name` mit U+5350: der angelegte Kanal heisst „Mias Raum“ |
| nach dem Anlegen kommt das Menü in den Textchat des Raums … | eine Nachricht im Raum, „## Dein Sprachraum“, `allowed_mentions` leer, drei Reihen mit je vier Knöpfen, jede `custom_id` mit `sprachraum:`, die zwölf Namen der Tabelle |
| scheitert das Menü, bleibt der Raum ohne Knöpfe … | Senden mit 50013: Zeile bleibt, nichts gelöscht, eine Logzeile ohne ID |
| ohne Kategorie hat der Raum nur die Einträge von Besitzer und Bot | kein `parent_id`, zwei Einträge für Personen (Typ 1) mit ihren Rechten |
| wer schon einen Raum hat, kommt zurück in den eigenen … | kein zweites Anlegen, Verschieben in den eigenen Raum |
| höchstens ein neuer Raum je 30 s und Mitglied | mit der Uhr aus `RaumKontext`: nach 29 s nichts, nach 30 s neu |
| ein Raum je Mitglied … | zwei gleichzeitige Beitritte legen einen Raum an; `UNIQUE (server, besitzer)` weist eine zweite Zeile ab |
| ein leerer Raum geht nach der Wartezeit … | kommt jemand in der Wartezeit, bleibt er; sonst gehen Kanal und Zeile |
| ist ein leerer Raum bei Discord schon weg (10003) … | Löschen mit 10003: Zeile weg, keine Logzeile |
| geht das Mitglied, bevor das Verschieben klappt (40032) … | der neue Raum geht wieder, keine Zeile, kein Log |
| fehlt dem Bot ein Recht (50013) … | nichts angelegt, nicht verschoben, eine Logzeile ohne ID |
| ist die Art aus oder der Kanal kein Erzeuger … | nichts angelegt |
| die Grenze von 30 s vergisst ein Mitglied nach ihrer Zeit | mit falscher Uhr in `planen`: nach dem Anlegen ein Eintrag, nach 29 999 ms noch einer, nach 30 000 ms keiner; unabhängig davon, wie lange `betritt` braucht |
| Räume stehen nicht unter den Optionen … | ein Raum fehlt unter den Optionen des Erzeugers, als Erzeuger `erzeuger_unbekannt` |
| der Abgleich beim Start … | Zeile ohne Kanal weg, leerer Raum gelöscht, belegter bleibt |
| channelDelete vergisst den Raum … | `geloescht`, `Aufraeumen#vergiss` und `#behalteNur` für Sprachräume und Räume |
| Aufraeumen prüft die Tabellen beim Bauen … | `bot/src/kern/aufraeumen.test.ts`: Umlaut und SQL im Namen werfen, eine Tabelle in zwei Modulen wirft, Module ohne Tabellen zählen nicht |
| vergiss und behalteNur löschen in einer Anweisung … | dieselbe Datei, ohne Datenbank: je eine Anfrage mit jeder Tabelle genau einmal, die Werte mit Shards; ohne Tabellen keine Anfrage |
| jede Tabelle mit Daten je Server (Spalte server bigint) gehört genau einem Modul oder dem Board | `bot/src/modulliste.test.ts`, PostgreSQL: die Tabellen aus `information_schema` nach allen Migrationen gegen die Tabellen aus `alleModule` und `Brett` |
| die Seiten kommen in der Reihenfolge der Tabs; vergiss leert den Cache … | dieselbe Datei: `beitritt`, `abschied`, `sprachraeume`; `vergiss` nimmt nur den einen Server aus beiden Caches |
| welches Modul welche Ereignisse, Befehle, Knöpfe und welchen Schalter hat | dieselbe Datei: Befehle `ping`, ohne Schalter; Begrüssung `beitritt`, `abschied`; Sprachräume `stimme` in `ereignisse`, `bereit`, `stimme`, `kanalWeg` in `aufraeumen` und das Präfix `sprachraum:`; beide mit freiem Schalter |
| ein Modul, das aus ist, bekommt keine Ereignisse, nur sein Aufräumen … | `bot/src/discord/modul.test.ts`: `haengeAn` mit einem Modul ohne und einem mit Schalter; an bekommt es alles, aus nur `aufraeumen`, und Befehl und Knopf antworten `modulAus`, ephemeral. Fällt, wenn `haengeAn` `istAn` nicht beachtet |
| scheitert die Frage, ob ein Modul an ist, kommt kein Ereignis an; Befehl und Knopf bekommen den allgemeinen Fehlersatz | dieselbe Datei: `istAn` wirft; kein Ereignis, Befehl und Knopf antworten „Das hat nicht geklappt.“, ephemeral, nicht `modulAus`; je eine Zeile `Board: <Fehler>`. Fällt, wenn sie `modulAus` antworten |
| meldeBereit: Aufräumen mit allen Servern … | dieselbe Datei: `aufraeumen.bereit` mit beiden Servern, `ereignisse.bereit` nur mit dem, auf dem das Modul an ist |
| ohne gespeicherten Stand: frei an, bezahlt aus … | `bot/src/brett/brett.test.ts`, PostgreSQL: `Brett#istAn` ohne Zeile; ohne Schalter immer an |
| die Seite: Hinweis, je Modul mit Schalter einer … | dieselbe Datei: Seite `module` mit `alleNeu`, `hinweis`, je Schalter einer, nicht freigeschaltet `gesperrt` mit `nicht_freigeschaltet` und ein `link` auf `https://discord.com/` |
| speichern schaltet um und gilt sofort … | dieselbe Datei: `istAn` gleich danach, ein anderer Server bleibt; `ungueltig` mit Feld bei falschem Typ, fehlendem Feld und einer Liste; `404` für eine andere Seite; fremde Felder zählen nicht |
| nicht freigeschaltet behält das Board den gespeicherten Schalter … | dieselbe Datei: freigeschaltet an, die Freischaltung endet, Speichern mit `false` und ohne Feld lässt die Zeile `true`, kommt sie wieder, ist das Modul ohne Speichern an |
| der Cache: Speichern und vergiss lesen neu, sonst nicht | dieselbe Datei: zwei `istAn`, eine Abfrage; nach `vergiss` eine zweite |
| ist ein Modul aus, fehlen seine Seiten, und seine Routen geben 409 … | `bot/src/api/server.test.ts`: `istAn` je Bereich; `GET …/seiten` ohne die Seiten, `PUT`, `POST`, `GET` und `DELETE` geben `409` `modul_aus`, ohne Rechte zuerst `403`. Fällt, wenn die Routen `istAn` nicht fragen |
| Beitritt und Abschied gehen als Mitglied an jedes Modul … | `bot/src/discord/modul.test.ts`: `haengeAn` mit zwei falschen Modulen, `guildMemberAdd` und `guildMemberRemove` aus discord.js; beide Module in der Reihenfolge der Liste |
| ein Wechsel des Sprachkanals kommt mit Griff, Person, vorher und nachher | dieselbe Datei: `voiceStateUpdate` mit zwei `VoiceState` |
| ein gelöschter Kanal eines Servers geht an die Module, ein Kanal einer DM nicht | dieselbe Datei: `channelDelete` mit einem Textkanal und einem `DMChannel` |
| ein Slash-Befehl geht an den Befehl seines Moduls, ein Knopf an das Modul mit seinem Präfix … | dieselbe Datei: echte Interaktionen über die Action `InteractionCreate`; ein fremdes Präfix geht an kein Modul |
| das Modul gibt Beitritt und Abschied an begruesse … | `bot/src/module/begruessung/senden.test.ts`, PostgreSQL: `begruessungsModul` mit eigenem Cache sendet den Text von Beitritt und Abschied |
| das Modul gibt Wechsel, gelöschte Kanäle und den Abgleich beim Start an seine Räume | `bot/src/module/sprachraeume/sprachraeume.test.ts`: `sprachraeumeModul` legt beim Betreten des Erzeugers nur über `ereignisse` einen Raum an, nicht über `aufraeumen`; `aufraeumen` vergisst ihn bei `kanalWeg` und beim Start einen Raum ohne Kanal |
| ist das Modul aus, löscht sein Aufräumen einen leeren Raum trotzdem | dieselbe Datei: ein Raum über `ereignisse`, danach nur `aufraeumen.stimme`: nach 2 s ist der Kanal gelöscht und die Zeile weg |
| die Seite bietet Sprachkanäle und Kategorien … | Bausteine der Seite und der Liste; Sortierung, ohne Text und Bühne; ohne „Mitglieder verschieben“ gesperrt mit `erzeuger_ohne_recht`; eine Kategorie, die „Streamen“ verbietet, das der Bot nicht hat, gesperrt mit `kategorie_ohne_recht` |
| fehlt dem Bot ein Recht auf dem Server, steht oben ein Hinweis | ohne „Kanäle verwalten“ ist der erste Baustein `hinweis` `rechte`, mit allen Rechten wieder `schalter` |
| die Seite liefert ohne Zeile die Standardwerte … | `{ an: false, erzeuger: [] }`, `fund` `null`, Speichern mit 100 Zeichen Vorlage und `meldung`, fremde Felder fallen weg, Cache geleert |
| jede Prüfregel meldet ihren Code und den Pfad des Felds | alle Zeilen der Tabelle „Sprachräume einstellen“, mit Pfaden wie `erzeuger.1.limit`; ein Array als Erzeuger ist `erzeuger.1` |
| istObjekt: nur ein Objekt mit Feldern … / ohneNul: nur ein Text ohne NUL | `bot/src/kern/eingabe.test.ts`: Objekt, Array, `null`, Text, Zahl; Text mit und ohne NUL |
| ein gespeicherter Erzeuger, der nicht mehr geht, steht als fund … | eine Kategorie ohne `bereit` gibt `kategorie_ohne_recht` an `erzeuger.0.kategorie` |
| Sperren: deferReply vor dem PATCH … | Callback mit Typ 5 und Flag 64 vor `PATCH /channels/{id}`; Body nur `permission_overwrites`; @everyone und Rollen ohne „Verbinden“, wer drin ist, mit eigenem; Grund im Audit-Log |
| Sperren: wer nicht Besitzer ist, bekommt den Hinweis … | Hinweis mit dem Besitzer, `allowed_mentions` leer; gesperrt bleibt gesperrt; kein PATCH |
| Entsperren: Verbinden wieder wie in der Kategorie … | Einträge wieder wie beim Anlegen; Hinweise für nicht gesperrt und Nicht-Besitzer |
| Verstecken und Zeigen … | Rollen ohne „Kanal ansehen“, wer drin ist, sieht und verbindet sich; Zeigen stellt die Einträge vom Anlegen her; Hinweise |
| Umbenennen: ein Formular mit dem Namen von jetzt … | Callback Typ 9, Label mit Textfeld `wert`, 1 bis 100 Zeichen, vorbelegt; Nicht-Besitzer Typ 4 mit Hinweis |
| Umbenennen: das Formular setzt den Namen, ohne Platzhalter … | Hakenkreuz und SS-Runen fallen, bleibt nichts, der Hinweis für einen leeren Namen; Body nur `name`, `{name}` bleibt, getrimmt; Cache umbenannt; leerer Name und Nicht-Besitzer ohne PATCH |
| Umbenennen bei 429 … | `Retry-After: 300`: Antwort unter 2 s, „erst in 5 min“ |
| Limit: ein Formular mit dem Limit von jetzt … | vorbelegt mit 4; `user_limit` 7 und 0; „zehn“ und Nicht-Besitzer ohne PATCH |
| ein Formular ohne Feld wert gibt den Hinweis … | `alsDruck` liest `wert` ohne zu werfen; Limit und Umbenennen ohne Feld geben ihren Hinweis, kein PATCH |
| Rauswerfen: ist das Mitglied beim Trennen schon weg (40032) … | „nicht im Raum“, keine Logzeile |
| Rauswerfen: die Nutzerauswahl nur für den Besitzer … | Auswahl Typ 5 mit `custom_id`; `deferUpdate`, getrennt mit Grund, Auswahl weg; nicht drin, sich selbst, Bot, Nicht-Besitzer: Hinweise |
| Bannen: Sehen und Verbinden verboten … | Eintrag mit beiden verboten, PATCH vor dem Trennen; zweimal, sich selbst, Bot: Hinweise |
| Bannen bei 30060 … | Hinweis, niemand getrennt, kein Log |
| Entbannen: hebt den Bann auf … | Eintrag weg; nicht gebannt und Nicht-Besitzer: Hinweise |
| Besitz übergeben: an ein Mitglied im Raum … | Zeile in `raeume`, Rechte des Besitzers, Grund; danach Hinweis an den alten Besitzer |
| Besitz übergeben: nicht im Raum, schon ein eigener Raum … | Hinweise; mit eigenem Raum weist `UNIQUE` ab; Besitz bleibt, kein PATCH |
| Besitz übergeben: kein anderer Bot wird Besitzer … | Bot in der Auswahl: Hinweis, Besitz bleibt, kein PATCH; Rauswerfen trennt ihn |
| Übernehmen: wer im Raum ist und keinen Raum hat … | `deferReply`, Zeile, Rechte, Grund |
| Übernehmen: Hinweise … | Besitzer drin, nicht drin, schon Besitzer, eigener Raum; Besitz bleibt |
| Info: für jeden, der den Chat sieht … | Besitzer, Limit, gesperrt, versteckt, Zahl der Gebannten; „keins“ bei 0 |
| ein Knopf in einem Kanal, der kein Raum ist … | „kein Sprachraum mehr“, auch für einen Knopf mit Auswahl |
| alsDruck: Art, Aktion, Server, Kanal, Nutzer und Bot … | Knopf, Auswahl mit einem Bot als Ziel (`bot: true`), Formular mit `wert`; `beantwortet` am Anfang falsch |
| alsDruck erkennt nur das Präfix … | andere `custom_id` gibt keinen `Druck`; eine unbekannte Aktion mit Präfix bekommt gleich einen Hinweis (Typ 4), ohne aufzuschieben |
| fehlt dem Bot ein Recht (50013) … / ein anderer Fehler … | Hinweis oder „Das hat nicht geklappt.“, je eine Logzeile ohne ID und Token |
| dauer: Sekunden unter einer Minute … | 50 ms, 12 s, 5 und 6 min |
| Rechte im Raum: … | `raumrechte` ohne Discord: Sperren und Verstecken hin und zurück ergeben die Einträge vom Anlegen; ohne Kategorie; Zeigen bei gesperrtem Raum; Bann und Entbannen; Gebannte bleiben gebannt; Kategorie-Sperre ist kein Bann; Besitzer und Bot behalten ihre Rechte; neuer Besitzer; der alte behält seinen Eintrag bis Entsperren oder Zeigen, dann wie in der Kategorie |
| jeder Code, den ein Modul unterscheidet, hat seinen eigenen … | `fehler.test.ts`: 50001 und 50013 `kein_recht`, 10003 `nicht_gefunden`, 10007 und 10013 `kein_mitglied`, 40032 `nicht_verbunden`, 30060 `zu_viele_eintraege`, 10004 und 30013 `anderes`; die Meldung bleibt |
| ein RateLimitError wird zu_schnell mit der Wartezeit … | `warten` aus `retryAfter`, die Meldung mit Methode, Route und Sekunden, ohne IDs; andere Fehler und Nicht-Fehler `anderes`; ein `DiscordFehler` bleibt, wie er ist |
| uebersetzt wirft DiscordFehler … | das Ergebnis geht durch, 40032 wird `nicht_verbunden` |
| der Griff trägt ID und Name … | `sprachkanaele.test.ts`: eingefroren, `guildVon` gibt die Guild; eine Kopie des Griffs hat keine |
| kontextVon gibt Griff und Mitglied … | ID des Servers, Mitglied mit Name und Zahl |
| eintraegeVon: die Einträge einer Kategorie mit art … | Rolle und Person mit ihren Bits; Sprach-, Text- und unbekannter Kanal ohne Ergebnis; `kategorieVon` |
| sprachraum: ein Sprachkanal mit Name, Limit und Einträgen … | `sprachkanaele.test.ts`: `id`, `name`, `limit`, Einträge mit `art`, die drei der Kategorie; Kategorie, Text- und unbekannter Kanal ohne Ergebnis |
| alsOverwrite macht aus art wieder den Typ … | `rolle` Typ 0, `person` Typ 1 |
| das Menü: Text, drei Reihen … | `menue.test.ts`: `alsNachricht`: Überschrift, `allowedMentions` leer, 3 × 4 Knöpfe mit Präfix, rot nur Rauswerfen und Bannen |
| die Auswahl: die Frage und genau ein Mitglied | `alsAuswahl`: Typ 5 mit `custom_id`, Platzhalter, 1 bis 1 |
| das Formular: Label (Typ 18) … | `alsModal`: Titel, Label mit Beschreibung, Textfeld `wert` mit Grenzen und Wert von jetzt |
| textkanal: nur Text- und Ankündigungskanäle … | `nachrichten.test.ts`: Text und Ankündigung ja; ohne Senden, ohne Sehen, Sprachkanal, unbekannt nicht; `anhaengen` nur mit „Dateien anhängen“ |
| textkanalAuf findet den Kanal über die IDs … | auf einem fremden Server nichts |
| sende: Text, der nur die genannten pingt … | `allowed_mentions` `{ parse: [], users: [ID] }`, ohne `pingt` `{ parse: [] }`, auch bei `@everyone` im Text |
| sende mit Datei: Multipart … | Name und Bytes der Datei, ohne Text kein `content` |
| Fehler von Discord werden eigene Codes … | 50013 und 50001 `kein_recht`, 10003 `nicht_gefunden`, sonst `anderes`; die Meldung bleibt |
| alsMitglied: Spitzname vor globalem Namen … | Benutzername, Avatar als PNG mit 256 px vom CDN, Server mit Name und 42 Mitgliedern |
| alsMitglied: ein Mitglied ausserhalb des Caches … | Partial beim Abschied mit globalem Anzeigenamen und Benutzernamen |
| Beitritt: Platzhalter im Text maskiert, nur das neue Mitglied pingt | `senden.test.ts` mit Fälschung: Text mit Spitzname und Servername maskiert, `{anzahl}`, `pingt` nur das Mitglied |
| Abschied: der Name, den die Schicht liefert, und niemand pingt | `pingt` leer |
| der gesendete Text hat keine Hasszeichen … | PostgreSQL: U+5350 in Name und Vorlage, U+534D im Servernamen; gesendet wird der Text ohne sie |
| darf der Bot im Kanal nicht senden … | keine Nachricht, eine Logzeile ohne ID und Namen |
| scheitert das Senden, steht eine Zeile im Log … | `DiscordFehler` aus `sende`: „nicht gesendet: Missing Permissions“ |
| mit Banner hängt der Bot beitritt.png … | Datei mit 1100 × 440, der Avatar des Mitglieds |
| scheitert das Banner oder fehlt „Dateien anhängen“ … | beide Male nur der Text, je eine Logzeile ohne ID |
| leerer Text ohne Banner schickt nichts … | auch eine ausgeschaltete Art; kein Log |
| Plaetze lässt höchstens zwei zugleich laufen … | fünf Aufgaben: nie mehr als zwei, Reihenfolge wie gekommen |
| die Bremse greift beim 6. Ereignis in 10 s … | mit falschen Uhren: 5 einzeln, `an`, `gezaehlt`; ein Ereignis nach 20 s setzt die Ruhe neu; nach 29 999 ms nichts, nach 30 000 ms `loese` mit 3; danach wieder einzeln |
| die Bremse zählt im Fenster von 10 s … | acht Ereignisse im Abstand von 2,1 s gehen einzeln |
| die Zusammenfassung sagt eins oder mehrere | Singular und Plural für beide Arten |
| Werte, Text und Bannerzeile ohne Hasszeichen, auch aus der Vorlage … | `werte`, `textFuer`, `bannerZeile` ohne Datenbank; Name nur aus Hakenkreuzen: Benutzername, im Text maskiert; ein einzelnes U+16CB bleibt im Text |
| im Banner werden Zierbuchstaben Buchstaben; bleibt vom Namen nichts zu zeichnen … | `bannerZeile`: 𝕿𝖊𝖘𝖙 im Namen und im Server wird „Test“ und „Probe“; ein Name ganz in Arabisch wird der Benutzername, auch in `{nutzer}`; im Text bleibt er |
| ohneHasszeichen: Hakenkreuze fallen, SS-Runen ab zwei … / nameOder … | `bot/src/kern/namen.test.ts`: alle sechs Hakenkreuze; SS-Runen gleich, gemischt, mit ZWJ oder VS16 dazwischen; erst die Hakenkreuze; ein einzelnes Zeichen und Runen mit Sichtbarem dazwischen bleiben; `nameOder` bei leerem oder unsichtbarem Namen |
| beim Raid gehen 5 einzeln, dann zählt die Bremse … | mit Fälschung und `t.mock.timers`: 5 Nachrichten mit Banner; nach 29 999 ms nichts, nach 30 000 ms dann die Zusammenfassung „Willkommen an die 2 neuen Mitglieder!“ ohne Ping und Banner; Logzeilen „Bremse an“ und „Bremse aus“; `bremse` zählt einmal; danach wieder einzeln |
| ein gezählter Abschied gibt die Zusammenfassung im Singular | „1 Mitglied hat den Server verlassen.“ |
| ist der Kanal beim Lösen weg, kommt keine Zusammenfassung … | der Bot verliert in den 30 s den Kanal: keine sechste Nachricht, „Bremse aus“ und „Kanal fehlt“ im Log, kein unbehandelter Fehler |
| bei ausgeschalteter Art zählt die Bremse nicht | zehn Ereignisse bei `an: false`, danach eingeschaltet geht das nächste einzeln |

## Tests gegen PostgreSQL

`bot/src/kern/datenbank.test.ts` braucht eine PostgreSQL mit den Variablen aus
[Datenbank](../bot/datenbank.md), „Verbindung“. Lokal startet sie
`docker compose up -d` in `bot/`, und `npm test` findet die Werte in
`bot/.env`; fehlt `DB_HOST`, werden diese Tests übersprungen. In der CI
läuft PostgreSQL 18 als Service im Job „Backend“, und fehlt dort die
Datenbank, scheitert der Test, statt übersprungen zu werden (`CI` ist
gesetzt). Die Tests legen die Tabellen `probe` und `probe_halb` und
Einträge `probe-…` in `migrationen` an und räumen sie danach weg.
