---
title: Tests
description: Wie die Tests des Bots laufen, was die gemockte Discord-API kann und was abgedeckt ist.
code:
  - bot/src/befehle.test.ts
  - bot/src/cache.test.ts
  - bot/src/datenbank.test.ts
  - bot/src/api.test.ts
  - bot/src/begruessung.test.ts
  - bot/src/banner.test.ts
  - bot/src/client.test.ts
  - bot/src/senden.test.ts
  - bot/src/testhilfe.ts
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

`npm test` baut mit `tsc` nach `bot/dist/` und startet
`node --test dist/*.test.js`. Gibt es `bot/.env`, liest `npm test` sie mit
`--env-file-if-exists`; kein Test gibt die Umgebung aus.

## Die gemockte API

`mockApi` in `bot/src/befehle.test.ts` startet einen `node:http`-Server
auf einem freien Port und gibt ein `REST` zurück, dessen `api` auf ihn
zeigt. Er antwortet der Reihe nach mit den Statuscodes, die der Test
vorgibt, danach mit 200, und merkt sich jede Anfrage mit Methode, Pfad
und Body. Ein 429 kommt mit `Retry-After: 0`.

Interaktionen ersetzt `interaktion` durch ein Objekt mit nur dem, was
`beantworte` braucht.

## Die API des Dashboards

`bot/src/api.test.ts` startet die API mit `erstelleApi` auf einem freien
Port und spricht sie mit `fetch` an, ohne Weiterleitungen zu folgen.
`bot/src/senden.test.ts` ruft `begruesse` mit Mitgliedern auf, wie
discord.js sie bei Beitritt und Abschied bringt. Beide nutzen
`bot/src/testhilfe.ts`:

- `mockDiscord`: ein `node:http`-Server für OAuth2 (`/oauth2/token`,
  `/oauth2/token/revoke`, `/users/@me`, `/users/@me/guilds`), für
  `GET /guilds/{id}/members/{user}`, für `POST /channels/{id}/messages`,
  auch mit Dateien, und für das CDN der Avatare. Er merkt sich jede
  Anfrage und jede Nachricht; je Test lässt sich die Antwort für Person und
  Mitglieder ändern.
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
| die Anmeldung tauscht den Code, widerruft den Token … | Reihenfolge der Aufrufe, Basic-Auth, Widerruf mit dem Token, in der Datenbank nur der SHA-256, nur verwaltbare Server, 7 Tage; danach `ich` und `server` |
| der Token wird auch widerrufen, wenn das Lesen der Person scheitert | Widerruf als letzter Aufruf, keine Sitzung, eine Logzeile |
| mit https tragen die Cookies Secure | `Secure` hinten am Cookie |
| abmelden braucht den Origin des Dashboards … | ohne und mit falschem Origin `403`, sonst `204`, Cookie gelöscht, danach `401` |
| eine abgelaufene Sitzung gilt nicht … | `401`, `raeumeAuf` löscht die Zeile |
| Bot nicht auf dem Server gibt 404 … | `404` ohne Aufruf an Discord, Unknown Member `403`, Recht entzogen `403`, Eigentümer ohne Rolle darf |
| nach 60 Anfragen je Minute kommt 429 … | `Retry-After` 1 bis 60, die 61. Anfrage fragt Discord nicht |
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
| Bild und Vorschau zusammen höchstens 20 je Minute … | die 21. Anfrage `429` ohne Aufruf an Discord; `kanaele` geht weiter |
| kein Code, Token, Cookie, state und keine ID im Log | Anmeldung mit Erfolg und drei Fehlern, eine Route mit `503`; keine Zeile enthält einen der Werte |
| Beitritt: Platzhalter im Text maskiert, nur das neue Mitglied pingt | Text mit Spitzname und Servername maskiert, `{anzahl}`, `allowed_mentions` |
| Abschied eines Mitglieds ausserhalb des Caches … | Partial mit globalem Anzeigenamen, `allowed_mentions` ohne Nutzer |
| darf der Bot im Kanal nicht senden … | keine Nachricht, eine Logzeile ohne ID und Namen |
| mit Banner hängt der Bot beitritt.png … | Datei mit 1100 × 440, Avatar vom CDN |
| scheitert das Banner oder fehlt „Dateien anhängen“ … | beide Male nur der Text, je eine Logzeile ohne ID |
| leerer Text ohne Banner schickt nichts … | auch eine ausgeschaltete Art; kein Log |

## Tests gegen PostgreSQL

`bot/src/datenbank.test.ts` braucht eine PostgreSQL mit den Variablen aus
[Datenbank](../bot/datenbank.md), „Verbindung“. Lokal startet sie
`docker compose up -d` in `bot/`, und `npm test` findet die Werte in
`bot/.env`; fehlt `DB_HOST`, werden diese Tests übersprungen. In der CI
läuft PostgreSQL 18 als Service im Job „Backend“, und fehlt dort die
Datenbank, scheitert der Test, statt übersprungen zu werden (`CI` ist
gesetzt). Die Tests legen die Tabellen `probe` und `probe_halb` und
Einträge `probe-…` in `migrationen` an und räumen sie danach weg.
