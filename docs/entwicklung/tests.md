---
title: Tests
description: Wie die Tests des Bots laufen, was die gemockte Discord-API kann und was abgedeckt ist.
code:
  - bot/src/befehle.test.ts
  - bot/src/cache.test.ts
  - bot/src/datenbank.test.ts
  - bot/package.json
  - .github/workflows/backend.yml
---

# Tests

Die Tests laufen mit `node --test`, ohne Testframework, gegen eine
gemockte Discord-API auf `127.0.0.1` und, wo es um SQL geht, gegen eine
echte MariaDB. Kein Test braucht einen Token oder das Netz.

```bash
cd bot
npm test
```

`npm test` baut mit `tsc` nach `bot/dist/` und startet
`node --test dist/*.test.js`.

## Die gemockte API

`mockApi` in `bot/src/befehle.test.ts` startet einen `node:http`-Server
auf einem freien Port und gibt ein `REST` zurück, dessen `api` auf ihn
zeigt. Er antwortet der Reihe nach mit den Statuscodes, die der Test
vorgibt, danach mit 200, und merkt sich jede Anfrage mit Methode, Pfad
und Body. Ein 429 kommt mit `Retry-After: 0`.

Interaktionen ersetzt `interaktion` durch ein Objekt mit nur dem, was
`beantworte` braucht.

## Was abgedeckt ist

| Test | prüft |
|---|---|
| registriere ersetzt alle Befehle mit einem PUT | Methode, Pfad, Namen der Befehle |
| registriere wartet nach 429 | genau ein zweiter Versuch |
| registriere gibt nach 5xx auf | der Fehler kommt beim Aufrufer an |
| /ping antwortet nur dem Nutzer, mit der Zeit der Datenbank | Text mit ms und Flag `Ephemeral` (64) |
| /ping antwortet auch, wenn die Datenbank fehlt | „nicht erreichbar“, eine Logzeile nur mit dem Fehlertext |
| /ping antwortet nach 2 s, wenn die Datenbank hängt | eine `query`, die nie zurückkommt; mit falschen Uhren: bei 1999 ms noch keine Antwort, bei 2000 ms „nicht erreichbar“ |
| gleichzeitige Anfragen laden einen Schlüssel nur einmal | `ladeCache` |
| nach delete und nach Ablauf wird neu geladen | `ladeCache` mit `ttl` 30 ms |
| mehr als max Schlüssel verdrängen den ältesten | `ladeCache` mit `max` 2 |
| verbindung braucht Host, Name, Nutzer und Passwort | `verbindung`, Standardport |
| migriere wendet jede Datei genau einmal an … | MariaDB: Reihenfolge nach Namen, zweiter Lauf leer, `BIGINT UNSIGNED` als Text |
| misse misst eine Anfrage an die Datenbank | MariaDB: `SELECT 1` |

## Tests gegen MariaDB

`bot/src/datenbank.test.ts` braucht eine MariaDB mit den Variablen aus
[Datenbank](../bot/datenbank.md), „Verbindung“. Lokal startet sie
`docker compose up -d` in `bot/`; fehlt `DB_HOST`, werden diese Tests
übersprungen. In der CI läuft MariaDB 11.4 als Service im Job „Backend“,
und fehlt dort die Datenbank, scheitert der Test, statt übersprungen zu
werden (`CI` ist gesetzt). Die Tests legen eine Tabelle `probe` an und
räumen sie danach weg.
| ein unbekannter Befehl … | Meldung an den Nutzer, eine Logzeile ohne Nutzerdaten |
