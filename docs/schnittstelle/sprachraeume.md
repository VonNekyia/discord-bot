---
title: API der Sprachräume
description: Die Seite Sprachräume im Baukasten des Dashboards; ihre Bausteine, Sprachkanäle und Kategorien als Optionen mit bereit, der Wert, Prüfregeln und Codes.
code:
  - bot/src/module/sprachraeume/seiten.ts
  - bot/src/module/sprachraeume/sprachraeume.ts
  - bot/src/api/server.ts
---

# API der Sprachräume

Das Modul Sprachräume meldet im [Baukasten](baukasten.md) eine Seite an:
`sprachraeume`. Mit ihr stellt das Team die Sprachräume eines Servers ein:
Erzeuger, Kategorien, Namensvorlagen und Limits. Ein Menü-Kanal gehört
nicht dazu; jeder Raum bekommt sein Menü im eigenen Textchat. Was die
Sprachräume in Discord tun, steht in [Sprachräume](../benutzung/sprachraeume.md).
Routen, Typen der Bausteine, Fehlerformat und Grenzen gelten wie im
Baukasten und in [API des Dashboards](api.md).

## Seite

| Seite | Titel | Bausteine mit Route |
|---|---|---|
| `sprachraeume` | Sprachräume | keine |

Gespeichert wird mit `PUT /api/server/{id}/seiten/sprachraeume`. Die Texte
der Bausteine und die Sätze zu den Codes stehen in
`bot/src/module/sprachraeume/seiten.ts`.

## Bausteine

| ID | Art | Was |
|---|---|---|
| `rechte` | `hinweis`, `warn` | nur ohne `ohneKategorie.bereit`, siehe „Typen“; nennt die Rechte aus [Sprachräume](../benutzung/sprachraeume.md), „Rechte und Intent“ |
| `an` | `schalter` | Aktiv |
| `erzeuger` | `liste` | höchstens 10, Kopf „Erzeuger“ mit dem Namen des Sprachkanals; neu mit `{name}s Raum`, Limit 0, ohne Kategorie |
| `erzeuger.<i>.kanal` | `auswahl` | die Sprachkanäle; `pflicht` `erzeuger_fehlt`, `unbekannt` `erzeuger_unbekannt`, `einmalig` `erzeuger_doppelt` mit `vergeben` „schon gewählt“; ohne `bereit` gesperrt mit `erzeuger_ohne_recht` |
| `erzeuger.<i>.kategorie` | `auswahl` | die Kategorien; `leer` heisst „Kategorie des Erzeugers“, `unbekannt` `kategorie_unbekannt`; ohne `bereit` gesperrt mit `kategorie_ohne_recht` |
| `erzeuger.<i>.name` | `text` | eine Zeile, `grenze` 100, `platzhalter` `{ name: 32 }`, `pflicht` `name_leer` |
| `erzeuger.<i>.limit` | `zahl` | 0 bis 99, `ungueltig` `limit_ungueltig` |

`erzeuger_fehlt` meldet nur die Oberfläche, wenn kein Sprachkanal gewählt
ist; der Bot sieht dann einen leeren Wert und meldet `ungueltig`.

## Typen

```ts
type Erzeuger = {
  kanal: string;
  kategorie: string | null; // null: die Kategorie des Erzeugers
  name: string; // Namensvorlage, etwa "{name}s Raum"
  limit: number; // 0 bis 99, 0 heisst unbegrenzt
};
type Sprachraeume = {
  an: boolean;
  erzeuger: Erzeuger[];
};
```

`Sprachraeume` ist der Wert der Seite. Ohne gespeicherte Zeile ist er
`{ an: false, erzeuger: [] }`. Gespeicherte IDs kommen, wie sie sind, auch
wenn es den Kanal nicht mehr gibt, wie bei der Begrüssung.

Die Optionen der beiden Auswahlen kommen aus `liste` in
`bot/src/module/sprachraeume/sprachraeume.ts`:

- Sprachkanäle und Kategorien des Servers, sortiert wie die Kanäle der
  Begrüssung, siehe [API der Begrüssung](begruessung.md), „Bausteine“.
  Bühnen gehören nicht dazu, die Räume selbst auch nicht; darum ist ein
  Raum als Erzeuger `erzeuger_unbekannt`. `gruppe` eines Sprachkanals ist
  seine Kategorie.
- Ein Sprachkanal ist `bereit`, wenn der Bot dort den Kanal sehen, sich
  verbinden und Mitglieder verschieben darf. Nur dann taugt er als
  Erzeuger.
- `ohneKategorie.bereit`: Der Bot hat auf dem ganzen Server alle Rechte
  aus [Sprachräume](../benutzung/sprachraeume.md), „Rechte und Intent“.
  Ohne sie kann er nirgends Räume anlegen.
- Eine Kategorie ist `bereit`, wenn `ohneKategorie.bereit` gilt, die
  Kategorie dem Bot keins dieser Rechte nimmt und er jedes Recht, das ein
  Rechte-Eintrag der Kategorie erlaubt oder verbietet, auf dem Server hat.
  Nur dann kann er dort Räume anlegen, denn er kopiert diese Einträge in
  jeden Raum, siehe [Sprachräume](../benutzung/sprachraeume.md), „Ablauf“.
  Ist `kategorie` `null` und steht der Erzeuger in keiner Kategorie, gilt
  `ohneKategorie.bereit`.

Ob die Kategorie eines Erzeugers ohne eigene Kategorie geht, hängt von
zwei Feldern ab. Das prüft nur der Bot; gespeichert steht es als `fund` in
der Seite.

## Sprachräume einstellen

`PUT …/seiten/sprachraeume` nimmt `Sprachraeume`. Der Bot prüft in dieser
Reihenfolge und antwortet beim ersten Fehler mit `400`, dem Code und dem
Feld. Bei einem Erzeuger nennt das Feld seine Stelle in der Liste, etwa
`erzeuger.0.kanal`.

| Feld | Regel | Code |
|---|---|---|
| alle | jedes Feld da, mit dem richtigen Typ; `erzeuger` ist eine Liste; kein NUL (`\0`) in `name` | `ungueltig` |
| `erzeuger` | höchstens 10 Einträge | `zu_viele_erzeuger` |
| `erzeuger.<i>.kanal` | ein Sprachkanal aus den Optionen | `erzeuger_unbekannt` |
| `erzeuger.<i>.kanal` | mit `bereit` | `erzeuger_ohne_recht` |
| `erzeuger.<i>.kanal` | jeder Kanal nur einmal in der Liste | `erzeuger_doppelt` |
| `erzeuger.<i>.kategorie` | `null` oder eine Kategorie aus den Optionen | `kategorie_unbekannt` |
| `erzeuger.<i>.kategorie` | der Bot darf dort Räume anlegen, siehe `bereit` oben | `kategorie_ohne_recht` |
| `erzeuger.<i>.name` | nicht leer, nicht nur Leerzeichen | `name_leer` |
| `erzeuger.<i>.name` | höchstens 100 Zeichen, wenn `{name}` 32 Zeichen hat | `name_zu_lang` |
| `erzeuger.<i>.limit` | ganze Zahl von 0 bis 99 | `limit_ungueltig` |
| `an` | `true` nur mit mindestens einem Erzeuger | `an_ohne_erzeuger` |

- Bei `ungueltig` nennt `feld` den ersten falschen Pfad, etwa
  `erzeuger.1.limit` oder `erzeuger.0.name` bei NUL. Ist `erzeuger` keine
  Liste, heisst das Feld `erzeuger`; ist der Body kein Objekt, `an`, wie
  bei der Begrüssung.
- Zeichen zählen wie in [Baukasten](baukasten.md), „Länge eines Texts“.
  32 ist die längste Länge eines Anzeigenamens, siehe
  [Begrüssung bei Beitritt und Abschied](../benutzung/begruessung.md),
  „Platzhalter“.
- Die Antwort ist `{ wert, meldung }`; `meldung` sagt, wie viele Erzeuger
  wirken, oder dass keine neuen Räume entstehen.
- Neue Werte gelten für Räume, die danach entstehen. Bestehende Räume
  bleiben, wie sie sind.
- Ist `an` aus, legt der Bot keine neuen Räume an. Bestehende bleiben, bis
  sie leer sind, und ihre Menüs wirken weiter.
