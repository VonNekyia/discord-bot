---
title: Einrichtung und Betrieb
description: Bot im Developer Portal anlegen, Secrets lokal und in GitHub, bauen, starten, einladen; wer welchen Bot anfasst.
code:
  - bot/.env.example
  - bot/package.json
  - bot/src/index.ts
  - bot/compose.yaml
---

# Einrichtung und Betrieb

Der Bot läuft unter Node 24 aus `bot/`. Er braucht den
`DISCORD_BOT_TOKEN`, mit dem er sich beim Gateway anmeldet, und eine
PostgreSQL, siehe [Datenbank](../bot/datenbank.md). Entwickelt wird
mit einem eigenen Test-Bot auf einem Test-Server; den Bot der Produktion
fasst kein Agent an.

## Bot anlegen

1. Im [Developer Portal](https://discord.com/developers/applications)
   eine Application anlegen.
2. Unter „Bot“ den Token erzeugen. Er wird nur einmal gezeigt. Wer ihn
   zurücksetzt, macht das Secret in GitHub ungültig.
3. Keinen privilegierten Intent einschalten, siehe
   [Intents](../bot/intents.md).

## Einstellungen im Developer Portal

Stand 2026-10-10, Anwendung „kitty“:

| Seite | Einstellung | Wert |
|---|---|---|
| Allgemeine Informationen | Name | `kitty` |
| Allgemeine Informationen, Bot | App-Icon, Icon | das Nekyia-Logo, eine Katze im Profil |
| Bot | Benutzername | `kitty` |
| Bot | Öffentlicher Bot | aus: Nur das Team kann den Bot auf einen Server holen |
| Bot | OAuth2-Code-Erlaubnis benötigt | aus |
| Bot | Presence, Server Members, Message Content | aus |
| Installation | Installationskontexte | nur Gildeninstallation |
| Installation | Installations-Link | „Keine“ |

Discord lässt einen privaten Bot nur ohne Installations-Link speichern.
Soll der Bot öffentlich werden, kommen „Öffentlicher Bot“ an und als Link
„Von Discord bereitgestellter Link“ mit den Scopes `bot` und
`applications.commands`, ohne Rechte.

## Secrets

| Name | Wofür | Wo |
|---|---|---|
| `DISCORD_BOT_TOKEN` | Anmeldung am Gateway und an der REST-API | lokal `bot/.env`, in GitHub Secret des Repositorys |
| `DB_PASSWORD` | Passwort der Datenbank | lokal `bot/.env`, für die Produktion Secret des Repositorys |

`DB_HOST`, `DB_PORT`, `DB_NAME` und `DB_USER` sind keine Secrets; für die
Dev-Datenbank stehen sie schon in `bot/.env.example`.

Lokal:

```bash
cp bot/.env.example bot/.env
```

Dann die Werte in `bot/.env` eintragen; `DB_PASSWORD` für die
Dev-Datenbank frei wählen. In GitHub setzt der Maintainer das
Secret; der Wert geht nie durch einen Chat oder ein Log:

```bash
gh secret set DISCORD_BOT_TOKEN -R VonNekyia/discord-bot
```

Die CI braucht keins davon: Die Tests laufen gegen eine gemockte API und
eine Wegwerf-PostgreSQL, siehe [Tests](../entwicklung/tests.md).

## Bauen und starten

```bash
cd bot
docker compose up -d
npm ci
npm run build
npm start
```

`docker compose up -d` startet die Dev-Datenbank. `npm start` liest
`bot/.env` mit `node --env-file`. Fehlt `DISCORD_BOT_TOKEN` oder eine
Pflichtvariable der Datenbank, endet der Bot sofort mit Exit 1. Dann wendet
er neue Migrationen an. Beim Start registriert er seine Befehle,
siehe [Rate-Limits](../bot/rate-limits.md), „Befehle registrieren“.

## Einladen

Einladungslink aus dem Developer Portal, „OAuth2“, „URL-Generator“, mit
den Scopes `bot` und `applications.commands`, ohne Rechte. Rechte auf dem
Server braucht der Bot für die heutigen Befehle keine, siehe
[Befehle](befehle.md). Solange der Bot privat ist, geht der Link nur für
das Team.

## Betrieb

Ein Dienst, etwa systemd, startet den Bot und startet ihn nach Exit 1 neu,
mit einigen Sekunden Abstand. Wann der Bot so endet, steht in
[Wiederanlauf](../bot/wiederanlauf.md).
