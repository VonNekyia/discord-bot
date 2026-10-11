---
title: Anmeldung am Dashboard
description: Discord-Login mit OAuth2, die Sitzung in PostgreSQL und ihr Cookie, die Prüfung von Rechten und Origin, die Umgebungsvariablen der API.
code:
  - bot/.env.example
  - web/serve.mjs
---

# Anmeldung am Dashboard

Wer das Dashboard nutzt, meldet sich mit Discord an, über OAuth2 mit
Authorization Code Grant. Der Bot tauscht den Code, liest Person und
Server, widerruft den Token sofort und legt eine Sitzung in PostgreSQL an.
Der Browser hält nur ein Cookie mit einer zufälligen Kennung. Ob jemand
einen Server einstellen darf, prüft der Bot bei jeder Anfrage neu. Die
Routen stehen in [API des Dashboards](api.md).

## Ablauf

1. `GET /api/anmelden` setzt das Cookie `anmeldung` mit einem zufälligen
   `state` aus 32 Byte (10 min, `HttpOnly`, `SameSite=Lax`, Pfad
   `/api/anmelden`) und leitet weiter zu
   `https://discord.com/oauth2/authorize` mit `response_type=code`,
   `client_id`, `scope=identify guilds`, `redirect_uri` und `state`.
2. Discord leitet zurück auf `/api/anmelden/zurueck` mit `code` und
   `state`. Fehlt das Cookie oder passt `state` nicht, ist die Anmeldung
   gescheitert.
3. Der Bot tauscht `code` bei `https://discord.com/api/oauth2/token` gegen
   einen Access Token, mit Client-ID und `DISCORD_CLIENT_SECRET`.
4. Er liest `GET /users/@me` und `GET /users/@me/guilds`. Er merkt sich die
   Server, auf denen die Person Eigentümer ist (`owner`) oder „Server
   verwalten“ oder „Administrator“ hat (`permissions`).
5. Er widerruft den Token bei `https://discord.com/api/oauth2/token/revoke`.
   Gespeichert wird der Token nie.
6. Er legt die Sitzung an, setzt das Cookie `sitzung`, löscht `anmeldung`
   und leitet auf `/dashboard/`.

Scheitert ein Schritt, auch wenn die Person bei Discord ablehnt, leitet der
Bot auf `/dashboard/?fehler=anmeldung`. Ins Log kommen nur der Schritt und
der Text des Fehlers, nie Code, Token oder Antwort von Discord.

Belege: [Authorization Code Grant](https://docs.discord.com/developers/topics/oauth2#authorization-code-grant),
[Get Current User Guilds](https://docs.discord.com/developers/resources/user#get-current-user-guilds),
[Permissions](https://docs.discord.com/developers/topics/permissions).
`GET /users/@me/guilds` liefert bis zu 200 Server, so viele, wie ein Konto
höchstens hat.

## Sitzung

| Was | Wert |
|---|---|
| Kennung | 32 zufällige Byte aus `node:crypto`, im Cookie als base64url |
| In der Datenbank | nur der SHA-256 der Kennung, dazu Discord-ID, Name, Avatar-Hash, die Server aus Schritt 4 und das Ablaufdatum |
| Laufzeit | 7 Tage ab Anmeldung, ohne Verlängern |
| Ende | `POST /api/abmelden` löscht die Zeile; abgelaufene Zeilen löscht der Bot spätestens nach einem Tag |

Das Cookie `sitzung` ist `HttpOnly`, `SameSite=Lax`, `Path=/`, mit
`Max-Age` gleich der Laufzeit, und `Secure`, sobald `DASHBOARD_URL` mit
`https://` beginnt. Steht nur die Kennung in der Datenbank, nützt ein
Abzug der Tabelle niemandem zum Anmelden. Was davon personenbezogen ist und
wie lange es bleibt, steht auf der Seite [Datenschutz](../bot/datenschutz.md).

Die Liste der Server in der Sitzung bestimmt nur, was `GET /api/server`
zeigt. Ein neuer Server erscheint erst nach neuer Anmeldung.

## Rechte

Jede Route mit `{id}` prüft, bevor sie etwas liest oder schreibt:

1. Der Bot ist auf dem Server, sonst `404` `nicht_gefunden`.
2. Die Person ist dort Mitglied und ist jetzt Eigentümer oder hat „Server
   verwalten“ oder „Administrator“, sonst `403` `kein_recht`.

Das prüft der Bot über discord.js, nicht aus der Sitzung, und ohne eigenen
Cache, siehe [Cache](../bot/cache.md), „Wann cachen“. Wer das Recht
verliert, kann sofort nichts mehr ändern.

## Origin

`PUT`, `POST` und `DELETE` brauchen den Header `Origin` gleich dem Origin
von `DASHBOARD_URL`, sonst `403` `origin_falsch`. Mit `SameSite=Lax`
zusammen kann so keine fremde Seite im Namen der Person schreiben. Ein
JSON-Body braucht `Content-Type: application/json`, sonst `415` `kein_json`.

Die Oberfläche schickt dafür nichts Eigenes mit, kein Token und keinen
Header: Der Browser setzt `Origin` bei `fetch` mit diesen Methoden und bei
einem Formular mit `method="post"` selbst. Ein Token im Formular braucht es
nicht, weil das Dashboard Skript voraussetzt, siehe Entscheidung
[0008](../entscheidungen/0008-api-im-bot-prozess.md).

Angemeldet wird mit einem Link auf `/api/anmelden`, nicht mit einem
Formular: Die CSP hat `form-action 'self'`, und Browser prüfen das auch
bei der Weiterleitung zu Discord. Abmelden ist ein `POST`.

## Umgebung

| Variable | Pflicht | Bedeutung |
|---|---|---|
| `DISCORD_CLIENT_SECRET` | für die API | Client-Secret der Anwendung, ein Secret |
| `DASHBOARD_URL` | für die API | Adresse, unter der man das Dashboard öffnet, ohne `/` am Ende; lokal `http://localhost:4173` |
| `API_PORT` | nein, Standard 4174 | Port der API, nur auf `127.0.0.1` |

- Die Client-ID ist die Application-ID; der Bot kennt sie nach dem Login
  bei Discord.
- Die Redirect-URL ist `DASHBOARD_URL` mit `/api/anmelden/zurueck`. Sie
  muss im Developer Portal genau so eingetragen sein.
- Fehlt `DISCORD_CLIENT_SECRET` oder `DASHBOARD_URL`, startet der Bot ohne
  API und schreibt das einmal ins Log.
- Lokal öffnet man das Dashboard genau unter `DASHBOARD_URL`. Unter einer
  anderen Adresse, etwa `127.0.0.1` statt `localhost`, fehlt nach der
  Rückkehr von Discord das Cookie `anmeldung`.

Client-Secret, Redirect-URL und Intent stellt der Maintainer im Developer
Portal ein, kein Agent, siehe [Einrichtung und Betrieb](../benutzung/einrichtung.md),
„Einstellungen im Developer Portal“.
