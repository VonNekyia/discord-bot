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
PostgreSQL, siehe [Datenbank](../bot/datenbank.md). Für das Dashboard
kommen `DISCORD_CLIENT_SECRET` und `DASHBOARD_URL` dazu; ohne sie startet
er ohne API. Entwickelt wird
mit einem eigenen Test-Bot auf einem Test-Server; den Bot der Produktion
fasst kein Agent an.

## Bot anlegen

1. Im [Developer Portal](https://discord.com/developers/applications)
   eine Application anlegen.
2. Unter „Bot“ den Token erzeugen. Er wird nur einmal gezeigt. Wer ihn
   zurücksetzt, macht das Secret in GitHub ungültig.
3. Unter „Privileged Gateway Intents“ nur „Server Members Intent“
   einschalten, siehe [Intents](../bot/intents.md).

## Einstellungen im Developer Portal

Stand 2026-10-10, Anwendung „kitty“:

| Seite | Einstellung | Wert |
|---|---|---|
| Allgemeine Informationen | Name | `kitty` |
| Allgemeine Informationen, Bot | App-Icon, Icon | das Nekyia-Logo, eine Katze im Profil |
| Bot | Benutzername | `kitty` |
| Bot | Öffentlicher Bot | aus: Nur das Team kann den Bot auf einen Server holen |
| Bot | OAuth2-Code-Erlaubnis benötigt | aus |
| Bot | Server Members Intent | an, Stand 2026-10-11 |
| Bot | Presence, Message Content | aus |
| Installation | Installationskontexte | nur Gildeninstallation |
| Installation | Installations-Link | „Keine“ |

Discord lässt einen privaten Bot nur ohne Installations-Link speichern.
Soll der Bot öffentlich werden, kommen „Öffentlicher Bot“ an und als Link
„Von Discord bereitgestellter Link“ mit den Scopes `bot` und
`applications.commands` und den Rechten aus „Einladen“.

Für das Dashboard fehlen noch zwei Einstellungen. Der Maintainer trägt sie
ein, kein Agent; danach stehen sie mit Datum in der Tabelle oben. Bis dahin
geht die Anmeldung am Dashboard nicht.

| Seite | Einstellung | Wert |
|---|---|---|
| OAuth2 | Client-Secret | erzeugen, als `DISCORD_CLIENT_SECRET` ablegen, siehe „Secrets“ |
| OAuth2 | Redirects | `DASHBOARD_URL` mit `/api/anmelden/zurueck`, lokal `http://localhost:4173/api/anmelden/zurueck` |

Die Redirect-URL muss genau so eingetragen sein, siehe
[Anmeldung am Dashboard](../schnittstelle/anmeldung.md), „Umgebung“.

## Secrets

| Name | Wofür | Wo |
|---|---|---|
| `DISCORD_BOT_TOKEN` | Anmeldung am Gateway und an der REST-API | lokal `bot/.env`, in GitHub Secret des Repositorys |
| `DB_PASSWORD` | Passwort der Datenbank | lokal `bot/.env`, für die Produktion Secret des Repositorys |
| `DISCORD_CLIENT_SECRET` | Tausch des Codes bei der Anmeldung am Dashboard | lokal `bot/.env`, in GitHub Secret des Repositorys |

`DB_HOST`, `DB_PORT`, `DB_NAME` und `DB_USER` sind keine Secrets; für die
Dev-Datenbank stehen sie schon in `bot/.env.example`. `DASHBOARD_URL` und
`API_PORT` sind auch keine, siehe
[Anmeldung am Dashboard](../schnittstelle/anmeldung.md), „Umgebung“.

Lokal:

```bash
cp bot/.env.example bot/.env
```

Dann die Werte in `bot/.env` eintragen; `DB_PASSWORD` für die
Dev-Datenbank frei wählen. In GitHub setzt der Maintainer die
Secrets; ein Wert geht nie durch einen Chat oder ein Log:

```bash
gh secret set DISCORD_BOT_TOKEN -R VonNekyia/discord-bot
gh secret set DISCORD_CLIENT_SECRET -R VonNekyia/discord-bot
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
Danach öffnet er die API, wenn `DISCORD_CLIENT_SECRET` und `DASHBOARD_URL`
da sind, siehe [API im Bot](../bot/dashboard-api.md), „Start und Ende“.

## Einladen

Einladungslink aus dem Developer Portal, „OAuth2“, „URL-Generator“, mit
den Scopes `bot` und `applications.commands` und diesen Rechten, zusammen
der Wert `286362640`, mit den Managed Commands `286362646`:

| Recht | für |
|---|---|
| Kanäle ansehen, Nachrichten senden, Dateien anhängen | die Begrüssung, siehe [Begrüssung bei Beitritt und Abschied](begruessung.md), „Rechte und Intent“ |
| Kanäle verwalten, Rollen verwalten, Mitglieder verschieben, Verbinden, Nachrichtenverlauf anzeigen | die Sprachräume, siehe [Sprachräume](sprachraeume.md), „Rechte und Intent“ |
| Mitglieder kicken, Mitglieder bannen | die Managed Commands, siehe [Managed Commands](managed-commands.md), „Rechte und Intent“; kommen mit `managed-commands-backend` |

`/ping` braucht keine Rechte, siehe [Befehle](befehle.md).
Die Rechte der Sprachräume braucht der Bot auf dem ganzen Server. Wer den
Bot schon eingeladen hat, gibt sie seiner Rolle von Hand oder lädt ihn neu
ein; ebenso die der Managed Commands. Solange der Bot privat ist, geht der
Link nur für das Team.

## Bezahlte Module

Für die bezahlten Module legt der Maintainer im Developer Portal unter
„Monetization“ die SKUs an und trägt ihre IDs in `bot/.env` ein:
`SKU_MANAGED_COMMANDS` (Consumable, 4,99 €), `SKU_ABO_LOG` und
`SKU_ABO_ALLES` (Abos je Server, 4,99 € und 19,99 € im Monat). Sie sind
keine Secrets. Fehlt eine, ist ihr Angebot aus; ist eine gesetzt, aber
keine ID, endet der Bot beim Start mit Exit 1. Was dann freigeschaltet
ist, steht in [Board der Module](../schnittstelle/module.md),
„Freischaltung“, und [0020](../entscheidungen/0020-bezahlte-module.md).

### Eigener Server

Der eigene Server bekommt die bezahlten Module über ein Test-Entitlement,
ohne Ausnahme im Code, siehe [0020](../entscheidungen/0020-bezahlte-module.md).
Der Maintainer legt es einmal an, mit `POST
/applications/{Anwendung}/entitlements`, der SKU aus `SKU_ABO_ALLES`, der
ID des Servers als `owner_id` und `owner_type` 1
([Create Test Entitlement](https://docs.discord.com/developers/resources/entitlement#create-test-entitlement)).
Es läuft nicht ab. Mit `DELETE` auf dasselbe Entitlement nimmt er es
wieder weg. Die IDs stehen nirgends im Repository (`AGENTS.md`, Regel 21).

## Betrieb

Ein Dienst, etwa systemd, startet den Bot und startet ihn nach Exit 1 neu,
mit einigen Sekunden Abstand. Wann der Bot so endet, steht in
[Wiederanlauf](../bot/wiederanlauf.md).
