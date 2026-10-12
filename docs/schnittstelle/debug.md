---
title: API der Debug-Seite
description: Die Route, mit der das Dashboard die Anfragen des Bots an Discord, ihre Rate-Limits, ungültige Anfragen und die eigenen Grenzen zeigt; wer sie sehen darf, Typen, was nie darin steht.
code:
  - bot/src/api/server.ts
  - bot/src/kern/zaehlung.ts
  - bot/src/discord/zaehlen.ts
---

# API der Debug-Seite

Mit dieser Route zeigt das Dashboard unter „Debug“, wie nah der Bot an den
Rate-Limits von Discord ist: Anfragen je Route, jedes 429, ungültige
Anfragen der letzten 10 min und wie oft unsere eigenen Grenzen gegriffen
haben. Die Zahlen gelten für den ganzen Bot, nicht für einen Server; darum
sieht sie nur, wem die Anwendung gehört. Warum so, steht in Entscheidung
[0016](../entscheidungen/0016-debug-im-speicher-fuer-den-eigentuemer.md).
Grundregeln, Fehlerformat und Grenzen je Sitzung gelten wie in
[API des Dashboards](api.md).

## Routen

| Methode und Pfad | Antwort |
|---|---|
| `GET /api/debug` | `200` `Debug`; ohne Recht `403` `kein_recht` |

`GET /api/ich` liefert dazu `Ich.debug`, siehe [API des Dashboards](api.md),
„Typen“. Die Oberfläche zeigt den Punkt „Debug“ nur, wenn es `true` ist.

Die Debug-Seite ist keine Seite des [Baukastens](baukasten.md): Der
Baukasten gilt je Server und für „Server verwalten“, die Zahlen gelten für
den ganzen Bot und für Eigentümer und Team der Anwendung. Die Oberfläche
zeigt sie als feste Ansicht im Rahmen des Dashboards, ohne einen Server zu
wählen. Den Stand liefert `debugStand` in `bot/src/discord/zaehlen.ts` aus
der `Zaehlung`, siehe [Rate-Limits](../bot/rate-limits.md), „Zählen“.

## Wer sie sehen darf

`Ich.debug` ist `true` und `GET /api/debug` antwortet nur, wenn die Person
der Eigentümer der Anwendung ist oder, gehört die Anwendung einem Team,
Mitglied dieses Teams mit angenommener Einladung, in jeder Rolle.

- Der Bot liest das mit `client.application.fetch()`: `owner` ist ein
  `User` oder ein `Team`, bei einem Team zählen die Mitglieder mit
  `membershipState` „angenommen“
  ([Get Current Application](https://docs.discord.com/developers/resources/application#get-current-application),
  [Team Member Object](https://docs.discord.com/developers/topics/teams#data-models-team-member-object)).
- Das Ergebnis hält er höchstens 5 min. Wer aus dem Team fliegt, sieht die
  Seite also spätestens 5 min später nicht mehr. Die Zahlen sind nur zum
  Lesen und enthalten nichts über Personen.
- `GET /api/debug` zählt zur Grenze von 60 je Minute und Sitzung, siehe
  [API des Dashboards](api.md), „Grenzen je Sitzung“.

## Typen

```ts
type Debug = {
  seit: string; // ISO 8601: Start des Prozesses; alle Zahlen gelten seitdem
  jetzt: string; // ISO 8601: Zeitpunkt der Antwort
  shards: number[]; // die Shards dieses Prozesses, etwa [0]
  routen: Route[];
  rateLimits: {
    anzahl: number; // jedes 429 von Discord seit `seit`
    global: number; // davon mit `global: true`
    scope: { user: number; global: number; shared: number };
  };
  ungueltig: {
    letzte10min: number; // 401, 403 und 429 in den letzten 10 min
    warnung: number; // 1000: ab hier eine Warnung im Log
    grenze: number; // 10000: ab hier sperrt Cloudflare die IP
  };
  eigene: Eigene[];
};

type Route = {
  methode: string; // GET, POST, PUT, PATCH, DELETE
  route: string; // ohne IDs und Tokens, etwa "/channels/:id/messages"
  anfragen: number;
  rateLimits: number; // davon 429
  limit: number | null; // letzter X-RateLimit-Limit
  remaining: number | null; // letzter X-RateLimit-Remaining
  resetAfter: number | null; // letzter X-RateLimit-Reset-After, in s
  zuletzt: string; // ISO 8601: letzte Antwort auf dieser Route
};

type Eigene = {
  name: 'bremse' | 'sitzung' | 'bilder' | 'testnachricht';
  gegriffen: number; // wie oft die Grenze seit `seit` gegriffen hat
};
```

- **Was zählt:** jede Anfrage des Bots an Discord, auch die vier der
  Anmeldung (`/oauth2/token`, `/oauth2/token/revoke`, `/users/@me`,
  `/users/@me/guilds`). Sie laufen dafür über `@discordjs/rest` wie alle
  anderen. Was der Bot über das Gateway sendet, zählt nicht.
- **`route`** ist eine Zeile je Methode und Route. IDs werden `:id`, Tokens
  von Webhooks und Interaktionen `:token`. Der Bot rechnet das selbst aus
  dem Pfad und verlässt sich nicht auf die Route von `@discordjs/rest`.
- **Die Header** stehen in [Rate Limits](https://docs.discord.com/developers/topics/rate-limits#header-format).
  Fehlt einer, ist der Wert `null`. `X-RateLimit-Bucket` gehört nicht zur
  Antwort. `limit`, `remaining` und `resetAfter` gelten zum Zeitpunkt
  `zuletzt`, nicht `jetzt`. Den Rest bis zum Reset rechnet die Oberfläche
  als `max(0, resetAfter − (jetzt − zuletzt))`.
- **Zeiten**: `seit`, `jetzt` und `zuletzt` sind ISO 8601 in UTC mit `Z`,
  etwa `2026-10-12T08:30:00.000Z`. Relative Zeiten wie „vor 12 s“ rechnet
  die Oberfläche gegen `jetzt` aus der Antwort, nicht gegen die Uhr des
  Browsers.
- **`ungueltig`**: ein gleitendes Fenster von 10 min
  ([Invalid Request Limit](https://docs.discord.com/developers/topics/rate-limits#invalid-request-limit-aka-cloudflare-bans)).
  Ein 429 mit `X-RateLimit-Scope: shared` zählt dort nicht mit, so wie bei
  Discord.
- **`eigene`**:
  - `bremse`: die Bremse der Begrüssung, siehe
    [Begrüssung bei Beitritt und Abschied](../benutzung/begruessung.md).
  - `sitzung`, `bilder` und `testnachricht`: die drei Zeilen aus
    [API des Dashboards](api.md), „Grenzen je Sitzung“, je `429`
    `zu_viele`.
- **Ordnung:** `routen` nach `anfragen` absteigend, bei Gleichstand nach
  `route` und `methode`. `eigene` in der Reihenfolge des Typs, auch mit 0.
- **Ein Prozess:** Die Zahlen gelten für den Prozess, der die API stellt.
  Laufen mehrere Shards in mehreren Prozessen, zählt jeder für sich.
  Zusammenführen kommt erst, wenn es mehrere gibt.

## Was nie darin steht

Keine IDs, keine Tokens, keine Namen, keine vollen Pfade und keine URL.
`majorParameter` aus `@discordjs/rest` trägt die ID von Kanal, Server
oder Webhook, bei Webhooks auch den Token; er gehört nicht in die Antwort
und nicht ins Log. Was ins Log geht, steht in
[Datenschutz](../bot/datenschutz.md), „Was ins Log geht“.

## Neu laden

Die Oberfläche lädt `GET /api/debug` beim Öffnen und dann höchstens alle
10 s neu, nur solange die Seite sichtbar ist. Das sind höchstens 6 von 60
Anfragen je Minute und Sitzung. Nach `429` wartet sie `Retry-After` ab,
nach `403` hört sie auf und zeigt die Meldung.
