---
title: API der Managed Commands
description: Die Seite strafen im Baukasten des Dashboards; vorgefertigte Gründe, Limits je Rolle aus Rolle, Bans und Kicks, die DM beim Bann mit dem Text zur Entbannung; Bausteine, Wert, Regeln beim Speichern und Codes.
code:
  - bot/src/kern/baukasten.ts
  - bot/src/api/server.ts
---

# API der Managed Commands

Das Modul Managed Commands (Ordner `bot/src/module/strafen/`) meldet im
[Baukasten](baukasten.md) eine Seite an: `strafen`, Tab „Managed
Commands“. Mit ihr stellt das Team die Befehle `/ban`, `/kick` und
`/warn` eines Servers ein: vorgefertigte Gründe, welche Rollen die Befehle
nutzen dürfen und wie oft, und die DM beim Bann. Was die Befehle in
Discord tun, steht in [Managed Commands](../benutzung/managed-commands.md).
Das Modul ist bezahlt; ohne Freischaltung ist es aus, und die Seite fehlt,
siehe [Board der Module](module.md). Routen, Typen der Bausteine,
Fehlerformat und Grenzen gelten wie im Baukasten und in
[API des Dashboards](api.md).

## Seite

| Seite | Titel | Bausteine mit Route |
|---|---|---|
| `strafen` | Managed Commands | keine |

Gespeichert wird mit `PUT /api/server/{id}/seiten/strafen`. Die Texte der
Bausteine und die Sätze zu den Codes stehen im Modul.

## Bausteine

| ID | Art | Was |
|---|---|---|
| `rechte` | `hinweis`, `warn` | nur, wenn dem Bot auf dem Server „Mitglieder bannen“ oder „Mitglieder kicken“ fehlt; nennt die fehlenden Rechte |
| `gruende` | `liste` | die vorgefertigten Gründe, höchstens 24; Eintrag „Grund“; neu mit leerem Text |
| `gruende.<i>.text` | `text` | eine Zeile, `grenze` 100, ohne Platzhalter, `pflicht` `grund_leer` |
| `limits` | `liste` | wer die Befehle nutzen darf, höchstens 25; Eintrag „Rolle“, Kopf `rolle`; neu mit `rolle` `null`, 1 Ban und 3 Kicks |
| `limits.<i>.rolle` | `auswahl` | die Rollen des Servers; `pflicht` `rolle_fehlt`, `unbekannt` `rolle_unbekannt`, `einmalig` `rolle_doppelt` mit `vergeben` „schon gewählt“ |
| `limits.<i>.bans` | `zahl` | Bans je 7 Tage, 0 bis 100, `ungueltig` `limit_ungueltig` |
| `limits.<i>.kicks` | `zahl` | Kicks je 7 Tage, 0 bis 100, `ungueltig` `limit_ungueltig` |
| `dm` | `schalter` | DM beim Bann |
| `dmText` | `text` | mehrzeilig, `grenze` 1400, `platzhalter` `{ server: 100, grund: 400 }`; die Nachricht an den Gebannten |
| `entbannung` | `text` | mehrzeilig, `grenze` 500, ohne Platzhalter; wie man entbannt wird, unter `dmText` |
| `verwarnungTage` | `zahl` | wie viele Tage der Bot eine Verwarnung speichert und mitzählt, 30 bis 730, `ungueltig` `verwarnung_tage_ungueltig` |

- **Höchstens 24 Gründe:** Discord zeigt in einer Antwort auf Autocomplete
  höchstens 25 Vorschläge
  ([Autocomplete](https://docs.discord.com/developers/interactions/receiving-and-responding#interaction-response-object-autocomplete)).
  Der 25. ist immer „Eigener Grund …“, siehe
  [Managed Commands](../benutzung/managed-commands.md), „Grund“.
- **100 Zeichen je Grund:** So lang darf der Name eines Vorschlags sein
  ([Application Command Option Choice Structure](https://docs.discord.com/developers/interactions/application-commands#application-command-object-application-command-option-choice-structure)).
- **Rollen:** alle Rollen des Servers ausser `@everyone` und den Rollen,
  die eine Integration verwaltet, etwa die eines Bots. Sortiert wie in
  Discord, die höchste zuerst; `gruppe` ist `null`.
- **Länge der DM:** `{server}` zählt mit 100 Zeichen, der längste Name
  eines Servers
  ([Guild Object](https://docs.discord.com/developers/resources/guild#guild-object-guild-structure)),
  `{grund}` mit 400, dem längsten Grund. `dmText` und `entbannung` mit
  einer Leerzeile dazwischen sind so höchstens 1902 Zeichen, unter der
  Grenze von 2000 für eine Nachricht
  ([Create Message](https://docs.discord.com/developers/resources/message#create-message)).

## Typen

```ts
type Grund = { text: string };
type Limit = {
  rolle: string;
  bans: number; // je 7 Tage, 0 bis 100
  kicks: number; // je 7 Tage, 0 bis 100
};
type Strafen = {
  gruende: Grund[];
  limits: Limit[];
  dm: boolean;
  dmText: string;
  entbannung: string;
  verwarnungTage: number; // 30 bis 730
};
```

`Strafen` ist der Wert der Seite. Ohne gespeicherte Zeile:

```ts
{
  gruende: [],
  limits: [],
  dm: true,
  dmText: 'Du wurdest von {server} gebannt. Grund: {grund}',
  entbannung: '',
  verwarnungTage: 365,
}
```

Ohne Eintrag in `limits` dürfen nur Eigentümer und Administratoren die
Befehle nutzen. Gespeicherte IDs kommen, wie sie sind, auch für Rollen,
die es nicht mehr gibt; `fund` nennt die erste.

## Managed Commands einstellen

`PUT …/seiten/strafen` nimmt `Strafen`. Der Bot prüft in dieser
Reihenfolge und antwortet beim ersten Fehler mit `400`, dem Code und dem
Feld, in einer Liste mit der Stelle, etwa `limits.0.rolle`.

| Feld | Regel | Code |
|---|---|---|
| alle | jedes Feld da, mit dem richtigen Typ; `gruende` und `limits` sind Listen; kein NUL (`\0`) in einem Text | `ungueltig` |
| `gruende` | höchstens 24 Einträge | `zu_viele_gruende` |
| `gruende.<i>.text` | nicht leer, nicht nur Leerzeichen | `grund_leer` |
| `gruende.<i>.text` | höchstens 100 Zeichen | `grund_zu_lang` |
| `gruende.<i>.text` | nicht `custom`, gross oder klein; das Wort steht für den eigenen Grund | `grund_reserviert` |
| `gruende.<i>.text` | jeder Grund nur einmal, gross und klein gleich | `grund_doppelt` |
| `limits` | höchstens 25 Einträge | `zu_viele_limits` |
| `limits.<i>.rolle` | eine Rolle aus den Optionen | `rolle_unbekannt` |
| `limits.<i>.rolle` | jede Rolle nur einmal in der Liste | `rolle_doppelt` |
| `limits.<i>.bans`, `limits.<i>.kicks` | ganze Zahl von 0 bis 100 | `limit_ungueltig` |
| `dmText` | höchstens 1400 Zeichen, wenn `{server}` 100 und `{grund}` 400 Zeichen hat | `dm_zu_lang` |
| `entbannung` | höchstens 500 Zeichen | `entbannung_zu_lang` |
| `verwarnungTage` | ganze Zahl von 30 bis 730 | `verwarnung_tage_ungueltig` |
| `dm` | `true` nur mit einem `dmText`, der nicht leer ist | `dm_ohne_text` |

- `rolle_fehlt` meldet nur die Oberfläche, wenn keine Rolle gewählt ist;
  der Bot sieht dann `null` und meldet `ungueltig`.
- Leerzeichen am Anfang und Ende eines Grunds schneidet der Bot ab, bevor
  er prüft und speichert.
- Zeichen zählen wie in [Baukasten](baukasten.md), „Länge eines Texts“.
- Die Antwort ist `{ wert, meldung }`; `meldung` sagt, wie viele Rollen
  die Befehle nutzen dürfen.
- Wird `verwarnungTage` kürzer, löscht der Bot die älteren Verwarnungen
  beim nächsten Aufräumen, siehe [Datenschutz](../bot/datenschutz.md).
  Wird es länger, kommen schon gelöschte nicht zurück.
- Neue Werte gelten für den nächsten Befehl. Das Limit zählt Bans und
  Kicks der letzten 7 Tage mit dem Limit, das dann gilt.

## Was noch fehlt

- Eine DM beim Kick. Der Auftrag nennt sie nur beim Bann.
