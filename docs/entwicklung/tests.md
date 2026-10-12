---
title: Tests
description: Wie die Tests des Bots laufen, was die gemockte Discord-API kann und was abgedeckt ist.
code:
  - bot/src/module/befehle/befehle.test.ts
  - bot/src/kern/cache.test.ts
  - bot/src/kern/datenbank.test.ts
  - bot/src/api/server.test.ts
  - bot/src/module/begruessung/begruessung.test.ts
  - bot/src/module/begruessung/banner.test.ts
  - bot/src/discord/client.test.ts
  - bot/src/module/begruessung/senden.test.ts
  - bot/src/testhilfe.ts
  - bot/src/module/sprachraeume/sprachraeume.test.ts
  - bot/src/module/sprachraeume/knoepfe.test.ts
  - bot/src/module/sprachraeume/raumrechte.test.ts
  - bot/src/kern/zaehlung.test.ts
  - bot/src/discord/zaehlen.test.ts
  - bot/src/discord/oauth.test.ts
  - bot/package.json
  - .github/workflows/backend.yml
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

`mockApi` in `bot/src/module/befehle/befehle.test.ts` startet einen `node:http`-Server
auf einem freien Port und gibt ein `REST` zurück, dessen `api` auf ihn
zeigt. Er antwortet der Reihe nach mit den Statuscodes, die der Test
vorgibt, danach mit 200, und merkt sich jede Anfrage mit Methode, Pfad
und Body. Ein 429 kommt mit `Retry-After: 0`.

Interaktionen ersetzt `interaktion` durch ein Objekt mit nur dem, was
`beantworte` braucht.

## Die API des Dashboards

`bot/src/api/server.test.ts` startet die API mit `erstelleApi` auf einem freien
Port und spricht sie mit `fetch` an, ohne Weiterleitungen zu folgen.
`bot/src/module/begruessung/senden.test.ts` ruft `begruesse` mit Mitgliedern auf, wie
discord.js sie bei Beitritt und Abschied bringt. Dort gibt die Bremse nur
200 ms Ruhe statt 30 s (`erstelleBremse`); mit falschen Uhren hängen
REST von discord.js und `fetch`. Die Zeiten selbst prüfen die Tests der
Bremse ohne Netz, mit `t.mock.timers`. Beide nutzen
`bot/src/testhilfe.ts`:

- `mockDiscord`: ein `node:http`-Server für OAuth2 (`/oauth2/token`,
  `/oauth2/token/revoke`, `/users/@me`, `/users/@me/guilds`), für
  `GET /guilds/{id}/members/{user}`, für `POST /channels/{id}/messages`,
  auch mit Dateien, für das CDN der Avatare, für Kanäle anlegen, ändern
  (`PATCH /channels/{id}`) und löschen, für Mitglieder verschieben und für
  die Antworten auf Interaktionen (`POST /interactions/{id}/{token}/callback`,
  `PATCH /webhooks/{id}/{token}/messages/@original`). Er merkt sich jede
  Anfrage, Nachricht, Anlage, Änderung mit dem Grund im Audit-Log,
  Verschiebung, Löschung und Antwort; je Test lässt sich die Antwort für
  Person und Mitglieder ändern, Anlegen, Ändern, Verschieben und Senden
  können mit einem Code von Discord scheitern, und Umbenennen kann mit 429
  und `Retry-After` antworten. Mit `tauschWarten` antwortet
  `POST /oauth2/token` mit 429 und den Sekunden in `Retry-After`, einmal je
  Eintrag.
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
States. Die Datei nutzt einen eigenen Server und eigene Personen.
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

## Was abgedeckt ist

| Test | prüft |
|---|---|
| registriere ersetzt alle Befehle mit einem PUT | Methode, Pfad, Namen der Befehle |
| registriere wartet nach 429 | genau ein zweiter Versuch |
| registriere gibt nach 5xx auf | der Fehler kommt beim Aufrufer an |
| /ping antwortet nur dem Nutzer, mit der Zeit der Datenbank | Text mit ms und Flag `Ephemeral` (64) |
| /ping antwortet auch, wenn die Datenbank fehlt | „nicht erreichbar“, eine Logzeile nur mit dem Fehlertext |
| /ping antwortet nach 2 s, wenn die Datenbank hängt | eine `query`, die nie zurückkommt; mit falschen Uhren: bei 1999 ms noch keine Antwort, bei 2000 ms „nicht erreichbar“ |
| ein unbekannter Befehl … | Meldung an den Nutzer, eine Logzeile ohne Nutzerdaten |
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
| hoechstens rechnet jeden Platzhalter … | längste Werte im Text und im Banner, Emoji zählt zwei |
| der Text darf mit den längsten Werten genau 2000 Zeichen haben … | Grenze genau, ein Zeichen mehr gibt den Code |
| jede Prüfregel meldet ihren Code und ihr Feld | `pruefe`: jede Zeile der Tabelle „Einstellung speichern“ |
| die Regeln gelten in der Reihenfolge der Tabelle | bei mehreren Fehlern der erste |
| eine gültige Einstellung kommt so zurück … | `bild` aus dem Stand, nicht aus der Eingabe |
| ein Name mit Emoji, Kanji und Hangul zeigt kein Kästchen | jedes Zeichen einzeln mit dem Schriftstapel gezeichnet, hat Tinte und ist nicht das Glyph für ein fehlendes Zeichen (`U+0378`); dass der Vergleich ein Kästchen erkennt, zeigt `😀` mit Inter allein |
| ein Banner mit Emoji und CJK im Namen hat 1100 × 440 px | `zeichne` mit dem Stapel |
| maskiere setzt vor jedes ASCII-Satzzeichen genau einen Backslash | Markdown, Erwähnung, Emoji; höchstens doppelt so lang; Umlaute, CJK und Emoji bleiben |
| ersetze maskiert im Text, lässt das Banner roh … | `<@…>` im Text, `@Name` im Banner; unbekannte Platzhalter bleiben; ein eingesetztes `{server}` bleibt stehen |
| apiUmgebung braucht Secret und Adresse des Dashboards | ohne eins keine API, Standardport, falsche Adresse oder Port beendet den Start |
| Grenze lässt 60 Anfragen je Minute zu … | mit falscher Uhr: 61. Anfrage, Sekunden bis zur nächsten, gleitendes Fenster |
| anmelden setzt ein state-Cookie und leitet zu Discord | Parameter der Weiterleitung, Cookie mit `HttpOnly`, `SameSite=Lax`, ohne `Secure` bei http |
| ohne state-Cookie oder mit falschem state … | Weiterleitung mit Fehler, keine Anfrage an Discord |
| bei 429 wartet die Anmeldung ein kurzes Retry-After ab … | `Retry-After: 0`: zweimal `POST /oauth2/token`, dann Erfolg; alle vier Routen zählen mit, eine Zeile `Rate-Limit: 429 bei POST /oauth2/token, …` |
| verlangt Discord länger als die Frist, scheitert die Anmeldung gleich … | `Retry-After: 60`: unter 2 s `?fehler=anmeldung`, ein Aufruf; Log nur „Anmeldung: Tausch: Discord antwortet 429, Retry-After 60 s“ und die Zeile der Zählung, ohne Code, Token, state und ID |
| die Anmeldung tauscht den Code, widerruft den Token … | Reihenfolge der Aufrufe, Basic-Auth, Widerruf mit dem Token, in der Datenbank nur der SHA-256, nur verwaltbare Server, 7 Tage; danach `ich` und `server` |
| der Token wird auch widerrufen, wenn das Lesen der Person scheitert | Widerruf als letzter Aufruf, keine Sitzung, eine Logzeile |
| mit https tragen die Cookies Secure | `Secure` hinten am Cookie |
| abmelden braucht den Origin des Dashboards … | ohne und mit falschem Origin `403`, sonst `204`, Cookie gelöscht, danach `401` |
| eine abgelaufene Sitzung gilt nicht … | `401`, `raeumeAuf` löscht die Zeile |
| Bot nicht auf dem Server gibt 404 … | `404` ohne Aufruf an Discord, Unknown Member `403`, Recht entzogen `403`, Eigentümer ohne Rolle darf |
| nach 60 Anfragen je Minute kommt 429 … | `Retry-After` 1 bis 60, die 61. Anfrage fragt Discord nicht; `sitzung` zählt eins mehr |
| antwortet Discord nicht, gibt es 503 … | eine Logzeile mit dem Namen der Route, ohne ID |
| kanaele liefert Text- und Ankündigungskanäle … | ohne Kategorie zuerst, Kategorien und Kanäle nach Position, bei gleicher nach ID; ohne Sehen kein Kanal, ohne Anhängen `banner: false` |
| begruessung liefert Standardwerte, speichert … | Standardwerte, `PUT` und wieder lesen |
| Speichern prüft Origin, Content-Type und Regeln | `403`, `415`, kaputtes JSON, Regeln mit Code und Feld |
| ein Body über 16 KiB gibt 413, ohne ihn ganz zu lesen | `Content-Length` zu gross ohne Body; chunked ohne Ende; danach `Connection: close` |
| verlässt der Bot einen Server, gehen Einstellungen und Bilder … | `vergiss` und `behalteNur` für beide Tabellen |
| mit dem ShardingManager gleicht ein Prozess nur … | Shard 1 von 2: der Server auf Shard 0 bleibt |
| unbekannte Routen, Arten und Methoden geben 404 | auch `POST` und `GET` auf `…/bild` |
| ein Bild wird geprüft, bevor es dekodiert wird | `bildtyp`; ein PNG nur mit Kopf und 20000 × 20000 px gibt `bild_zu_gross`, nicht `bild_unlesbar`; zu klein, kein Bild; SVG und GIF unter `image/png` geben `bild_unlesbar` an der Signatur |
| ein Bild über 4 MiB gibt 413, ohne es zu lesen | `Content-Length` über 4 MiB ohne Body |
| ein JPEG mit GPS wird gedreht … | WebP mit 1100 × 440, ohne `Exif`, ohne Beschreibung; Drehung 6 an den Farben; danach `bild: true`, `banner_ohne_recht` |
| Vorschau: 404 ohne Bild, sonst ein PNG … | `kein_bild`, PNG mit 1100 × 440, Avatar vom CDN; `DELETE` löscht Bild und `banner` |
| Bild und Vorschau zusammen höchstens 20 je Minute … | die 21. Anfrage `429` ohne Aufruf an Discord; `kanaele` geht weiter; `bilder` zählt eins mehr |
| die Regeln der Testnachricht gelten in ihrer Reihenfolge | `test_ohne_kanal`, `kanal_unbekannt`, `test_ohne_inhalt` mit Leerzeichen, ohne Bild und im Kanal ohne „Dateien anhängen“; keine Nachricht |
| die Testnachricht geht auch, wenn an aus ist … | `200` `{ banner: false }`, Zeile `-# Testnachricht aus dem Dashboard` vorn, `allowed_mentions` leer trotz `{nutzer}` |
| würde die Nachricht mit der Zeile länger als 2000 Zeichen … | bei 1990 Zeichen Text geht nur der Text |
| mit Banner antwortet sie banner: true … | Datei `beitritt.png`, nur die Zeile als Text; im Kanal ohne Dateien `{ banner: false }` |
| ist der Text leer und scheitert das Banner … | `503`, keine Nachricht |
| die Grenze je Server zählt erst nach den Rechten … | fünfmal `403` für eine fremde Sitzung, danach dreimal `200` und `429` mit `Retry-After: 60`; `testnachricht` zählt eins mehr |
| kein Code, Token, Cookie, state und keine ID im Log | Anmeldung mit Erfolg und drei Fehlern, eine Route mit `503`; keine Zeile enthält einen der Werte |
| ein Erzeuger legt den Raum … in einem Aufruf an | eine private Kategorie: Name aus der Vorlage, Kategorie, Limit; die Einträge der Kategorie, @everyone ohne „Kanal ansehen“, der Besitzer zusammengeführt, der Bot; verschoben mit Grund; Zeile in `raeume` |
| nach dem Anlegen kommt das Menü in den Textchat des Raums … | eine Nachricht im Raum, „## Dein Sprachraum“, `allowed_mentions` leer, drei Reihen mit je vier Knöpfen, jede `custom_id` mit `sprachraum:`, die zwölf Namen der Tabelle |
| scheitert das Menü, bleibt der Raum ohne Knöpfe … | Senden mit 50013: Zeile bleibt, nichts gelöscht, eine Logzeile ohne ID |
| ohne Kategorie hat der Raum nur die Einträge von Besitzer und Bot | kein `parent_id`, zwei Einträge |
| wer schon einen Raum hat, kommt zurück in den eigenen … | kein zweites Anlegen, Verschieben in den eigenen Raum |
| höchstens ein neuer Raum je 30 s und Mitglied | mit der Uhr aus `RaumKontext`: nach 29 s nichts, nach 30 s neu |
| ein Raum je Mitglied … | zwei gleichzeitige Beitritte legen einen Raum an; `UNIQUE (server, besitzer)` weist eine zweite Zeile ab |
| ein leerer Raum geht nach der Wartezeit … | kommt jemand in der Wartezeit, bleibt er; sonst gehen Kanal und Zeile |
| geht das Mitglied, bevor das Verschieben klappt (40032) … | der neue Raum geht wieder, keine Zeile, kein Log |
| fehlt dem Bot ein Recht (50013) … | nichts angelegt, nicht verschoben, eine Logzeile ohne ID |
| ist die Art aus oder der Kanal kein Erzeuger … | nichts angelegt |
| die Grenze von 30 s vergisst ein Mitglied nach ihrer Zeit | mit `abstand` 1 s: nach dem Anlegen ein Eintrag, nach 1,1 s keiner. Die Grenze läuft schon während `betritt`; mit 50 ms war sie in der CI manchmal vor der ersten Prüfung abgelaufen |
| Räume stehen nicht in sprachkanaele … | ein Raum fehlt in der Liste, als Erzeuger `erzeuger_unbekannt` |
| der Abgleich beim Start … | Zeile ohne Kanal weg, leerer Raum gelöscht, belegter bleibt |
| channelDelete vergisst den Raum … | `geloescht`, `vergiss` und `behalteNur` für Sprachräume und Räume |
| sprachkanaele liefert Sprachkanäle und Kategorien mit bereit … | Sortierung, ohne Text und Bühne; ohne „Mitglieder verschieben“ nicht bereit; eine Kategorie, die „Streamen“ verbietet, das der Bot nicht hat, nicht bereit |
| sprachraeume liefert ohne Zeile die Standardwerte … | `{ an: false, erzeuger: [] }`, Speichern mit 100 Zeichen Vorlage, fremde Felder fallen weg, Cache geleert |
| jede Prüfregel meldet ihren Code und den Pfad des Felds | alle Zeilen der Tabelle „Sprachräume einstellen“, mit Pfaden wie `erzeuger.1.limit` |
| Sperren: deferReply vor dem PATCH … | Callback mit Typ 5 und Flag 64 vor `PATCH /channels/{id}`; Body nur `permission_overwrites`; @everyone und Rollen ohne „Verbinden“, wer drin ist, mit eigenem; Grund im Audit-Log |
| Sperren: wer nicht Besitzer ist, bekommt den Hinweis … | Hinweis mit dem Besitzer, `allowed_mentions` leer; gesperrt bleibt gesperrt; kein PATCH |
| Entsperren: Verbinden wieder wie in der Kategorie … | Einträge wieder wie beim Anlegen; Hinweise für nicht gesperrt und Nicht-Besitzer |
| Verstecken und Zeigen … | Rollen ohne „Kanal ansehen“, wer drin ist, sieht und verbindet sich; Zeigen stellt die Einträge vom Anlegen her; Hinweise |
| Umbenennen: ein Formular mit dem Namen von jetzt … | Callback Typ 9, Label mit Textfeld `wert`, 1 bis 100 Zeichen, vorbelegt; Nicht-Besitzer Typ 4 mit Hinweis |
| Umbenennen: das Formular setzt den Namen, ohne Platzhalter … | Body nur `name`, `{name}` bleibt, getrimmt; Cache umbenannt; leerer Name und Nicht-Besitzer ohne PATCH |
| Umbenennen bei 429 … | `Retry-After: 300`: Antwort unter 2 s, „erst in 5 min“ |
| Limit: ein Formular mit dem Limit von jetzt … | vorbelegt mit 4; `user_limit` 7 und 0; „zehn“ und Nicht-Besitzer ohne PATCH |
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
| istMenue erkennt nur das Präfix … | andere `custom_id` nicht; unbekannte Aktion mit Präfix bekommt einen Hinweis |
| fehlt dem Bot ein Recht (50013) … / ein anderer Fehler … | Hinweis oder „Das hat nicht geklappt.“, je eine Logzeile ohne ID und Token |
| dauer: Sekunden unter einer Minute … | 50 ms, 12 s, 5 und 6 min |
| Rechte im Raum: … | `raumrechte` ohne Discord: Sperren und Verstecken hin und zurück ergeben die Einträge vom Anlegen; ohne Kategorie; Zeigen bei gesperrtem Raum; Bann und Entbannen; Gebannte bleiben gebannt; Kategorie-Sperre ist kein Bann; Besitzer und Bot behalten ihre Rechte; neuer Besitzer; der alte behält seinen Eintrag bis Entsperren oder Zeigen, dann wie in der Kategorie |
| Beitritt: Platzhalter im Text maskiert, nur das neue Mitglied pingt | Text mit Spitzname und Servername maskiert, `{anzahl}`, `allowed_mentions` |
| Abschied eines Mitglieds ausserhalb des Caches … | Partial mit globalem Anzeigenamen, `allowed_mentions` ohne Nutzer |
| darf der Bot im Kanal nicht senden … | keine Nachricht, eine Logzeile ohne ID und Namen |
| mit Banner hängt der Bot beitritt.png … | Datei mit 1100 × 440, Avatar vom CDN |
| scheitert das Banner oder fehlt „Dateien anhängen“ … | beide Male nur der Text, je eine Logzeile ohne ID |
| leerer Text ohne Banner schickt nichts … | auch eine ausgeschaltete Art; kein Log |
| Plaetze lässt höchstens zwei zugleich laufen … | fünf Aufgaben: nie mehr als zwei, Reihenfolge wie gekommen |
| die Bremse greift beim 6. Ereignis in 10 s … | mit falschen Uhren: 5 einzeln, `an`, `gezaehlt`; ein Ereignis nach 20 s setzt die Ruhe neu; nach 29 999 ms nichts, nach 30 000 ms `loese` mit 3; danach wieder einzeln |
| die Bremse zählt im Fenster von 10 s … | acht Ereignisse im Abstand von 2,1 s gehen einzeln |
| die Zusammenfassung sagt eins oder mehrere | Singular und Plural für beide Arten |
| beim Raid gehen 5 einzeln, dann zählt die Bremse … | gegen den Mock: 5 Nachrichten mit Banner, dann die Zusammenfassung „Willkommen an die 2 neuen Mitglieder!“ ohne Ping und Banner; Logzeilen „Bremse an“ und „Bremse aus“; `bremse` zählt einmal; danach wieder einzeln |
| ein gezählter Abschied gibt die Zusammenfassung im Singular | „1 Mitglied hat den Server verlassen.“ |
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
