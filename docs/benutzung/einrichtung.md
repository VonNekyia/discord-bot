---
title: Einrichtung und Betrieb
description: Bot im Developer Portal anlegen, Secrets lokal und in GitHub, bauen, starten, einladen; wer welchen Bot anfasst.
code:
  - bot/.env.example
  - bot/package.json
  - bot/src/index.ts
---

# Einrichtung und Betrieb

Der Bot läuft unter Node 24 aus `bot/`. Er braucht ein Secret,
`DISCORD_TOKEN`, und meldet sich damit beim Gateway an. Entwickelt wird
mit einem eigenen Test-Bot auf einem Test-Server; den Bot der Produktion
fasst kein Agent an.

## Bot anlegen

1. Im [Developer Portal](https://discord.com/developers/applications)
   eine Application anlegen.
2. Unter „Bot“ den Token erzeugen. Er wird nur einmal gezeigt.
3. Keinen privilegierten Intent einschalten, siehe
   [Intents](../bot/intents.md).

## Secrets

| Name | Wofür | Wo |
|---|---|---|
| `DISCORD_TOKEN` | Anmeldung am Gateway und an der REST-API | lokal `bot/.env`, in GitHub Secret des Repositorys |

Lokal:

```bash
cp bot/.env.example bot/.env
```

Dann den Wert in `bot/.env` eintragen. In GitHub setzt der Maintainer das
Secret; der Wert geht nie durch einen Chat oder ein Log:

```bash
gh secret set DISCORD_TOKEN -R VonNekyia/discord-bot
```

Die CI braucht das Secret nicht: Die Tests laufen gegen eine gemockte API,
siehe [Tests](../entwicklung/tests.md).

## Bauen und starten

```bash
cd bot
npm ci
npm run build
npm start
```

`npm start` liest `bot/.env` mit `node --env-file`. Ohne `DISCORD_TOKEN`
endet der Bot sofort mit Exit 1. Beim Start registriert er seine Befehle,
siehe [Rate-Limits](../bot/rate-limits.md), „Befehle registrieren“.

## Einladen

Einladungslink aus dem Developer Portal, „OAuth2“, mit den Scopes `bot`
und `applications.commands`. Rechte auf dem Server braucht der Bot für die
heutigen Befehle keine, siehe [Befehle](befehle.md).

## Betrieb

Ein Dienst, etwa systemd, startet den Bot und startet ihn nach Exit 1 neu,
mit einigen Sekunden Abstand. Wann der Bot so endet, steht in
[Wiederanlauf](../bot/wiederanlauf.md).
