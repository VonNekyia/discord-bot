---
title: Tests
description: Wie die Tests des Bots laufen, was die gemockte Discord-API kann und was abgedeckt ist.
code:
  - bot/src/befehle.test.ts
  - bot/package.json
---

# Tests

Die Tests laufen mit `node --test`, ohne Testframework, gegen eine
gemockte Discord-API auf `127.0.0.1`. Kein Test braucht einen Token oder
das Netz.

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
| /ping antwortet nur dem Nutzer | Text und Flag `Ephemeral` (64) |
| ein unbekannter Befehl … | Meldung an den Nutzer, eine Logzeile ohne Nutzerdaten |
