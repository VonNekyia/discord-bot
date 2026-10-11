---
title: API der Sprachräume
description: Die Routen, mit denen das Dashboard die Sprachräume eines Servers einstellt und das Menü sendet; Typen, Prüfregeln, Codes.
code:
  - bot/src/index.ts
  - web/serve.mjs
---

# API der Sprachräume

Mit diesen Routen stellt das Team im Dashboard die Sprachräume eines
Servers ein: Erzeuger, Kategorien, Namensvorlagen, Limits und den Kanal für
das Menü. Was die Sprachräume in Discord tun, steht in
[Sprachräume](../benutzung/sprachraeume.md). Grundregeln, Rechte, Fehlerformat
und Grenzen je Sitzung gelten wie in [API des Dashboards](api.md).

## Routen

| Methode und Pfad | Antwort |
|---|---|
| `GET /api/server/{id}/sprachkanaele` | `200` `{ sprachkanaele: Sprachkanal[], kategorien: Kategorie[], ohneKategorie: { bereit: boolean } }` |
| `GET /api/server/{id}/sprachraeume` | `200` `Sprachraeume` |
| `PUT /api/server/{id}/sprachraeume` | `200` `Sprachraeume`, so wie gespeichert |
| `POST /api/server/{id}/sprachraeume/menue` | `204`; das Menü ist gesendet |

## Typen

```ts
type Sprachkanal = {
  id: string;
  name: string;
  kategorie: { id: string; name: string } | null;
  bereit: boolean;
};
type Kategorie = { id: string; name: string; bereit: boolean };
type Erzeuger = {
  kanal: string;
  kategorie: string | null; // null: die Kategorie des Erzeugers
  name: string; // Namensvorlage, etwa "{name}s Raum"
  limit: number; // 0 bis 99, 0 heisst unbegrenzt
};
type Sprachraeume = {
  an: boolean;
  menue: string | null; // Textkanal für das Menü
  erzeuger: Erzeuger[];
  menueGesendet: boolean; // nur lesen
};
```

- `GET …/sprachkanaele` liefert die Sprachkanäle und die Kategorien des
  Servers, sortiert wie `GET …/kanaele`, siehe [API des Dashboards](api.md),
  „Typen“. Bühnen gehören nicht dazu.
- `Sprachkanal.bereit`: Der Bot darf dort den Kanal sehen, sich verbinden
  und Mitglieder verschieben. Nur dann taugt er als Erzeuger.
- `ohneKategorie.bereit`: Der Bot hat auf dem ganzen Server „Kanäle
  verwalten“, „Rollen verwalten“, „Mitglieder verschieben“, „Verbinden“ und
  „Kanal ansehen“. Ohne diese Rechte auf dem Server kann er nirgends Räume
  anlegen, siehe [Sprachräume](../benutzung/sprachraeume.md), „Rechte und
  Intent“.
- `Kategorie.bereit`: `ohneKategorie.bereit`, und die Kategorie nimmt dem
  Bot keins dieser Rechte. Nur dann kann er dort Räume anlegen. Ist
  `kategorie` `null` und steht der Erzeuger in keiner Kategorie, gilt
  `ohneKategorie.bereit`. So kann die Oberfläche `kategorie_ohne_recht`
  vor dem Speichern erkennen.
- `menue` ist ein Kanal aus `GET …/kanaele` mit `verlauf: true`, siehe
  [API des Dashboards](api.md), „Typen“.
- `menueGesendet` ist `true`, wenn im gespeicherten Menü-Kanal das Menü des
  Bots jetzt steht. Der Bot fragt dafür bei jedem `GET …/sprachraeume` bei
  Discord nach der gemerkten Nachricht. Hat sie jemand von Hand gelöscht
  oder wurde der Kanal gewechselt, ist der Wert `false`, bis das Menü neu
  gesendet ist. Die Antwort auf `PUT …/sprachraeume` prüft ebenso live.
- Ohne gespeicherte Zeile liefert `GET …/sprachraeume`
  `{ an: false, menue: null, erzeuger: [], menueGesendet: false }`.
- Gespeicherte IDs kommen, wie sie sind, auch wenn es den Kanal nicht mehr
  gibt, wie bei der Begrüssung.

## Sprachräume einstellen

`PUT …/sprachraeume` nimmt `Sprachraeume`; `menueGesendet` darf fehlen und
wird ignoriert. Das Backend prüft in dieser Reihenfolge und antwortet beim
ersten Fehler mit `400`, dem Code und dem Feld. Bei einem Erzeuger nennt das
Feld seine Stelle in der Liste, etwa `erzeuger.0.kanal`.

| Feld | Regel | Code |
|---|---|---|
| alle | jedes Feld ausser `menueGesendet` da, mit dem richtigen Typ; `erzeuger` ist eine Liste; kein NUL (`\0`) in `name` | `ungueltig` |
| `erzeuger` | höchstens 10 Einträge | `zu_viele_erzeuger` |
| `erzeuger.<i>.kanal` | ein Sprachkanal aus `GET …/sprachkanaele` | `erzeuger_unbekannt` |
| `erzeuger.<i>.kanal` | mit `bereit: true` | `erzeuger_ohne_recht` |
| `erzeuger.<i>.kanal` | jeder Kanal nur einmal in der Liste | `erzeuger_doppelt` |
| `erzeuger.<i>.kategorie` | `null` oder eine Kategorie aus `GET …/sprachkanaele` | `kategorie_unbekannt` |
| `erzeuger.<i>.kategorie` | der Bot darf dort Räume anlegen, siehe `bereit` oben | `kategorie_ohne_recht` |
| `erzeuger.<i>.name` | nicht leer, nicht nur Leerzeichen | `name_leer` |
| `erzeuger.<i>.name` | höchstens 100 Zeichen, wenn `{name}` 32 Zeichen hat | `name_zu_lang` |
| `erzeuger.<i>.limit` | ganze Zahl von 0 bis 99 | `limit_ungueltig` |
| `menue` | `null` oder ein Kanal aus `GET …/kanaele` | `kanal_unbekannt` |
| `menue` | mit `verlauf: true` | `menue_ohne_recht` |
| `an` | `true` nur mit mindestens einem Erzeuger | `an_ohne_erzeuger` |
| `an` | `true` nur mit `menue` | `an_ohne_menue` |

- Bei `ungueltig` nennt `feld` den ersten falschen Pfad, etwa
  `erzeuger.1.limit` oder `erzeuger.0.name` bei NUL. Ist `erzeuger` keine
  Liste, heisst das Feld `erzeuger`; ist der Body kein Objekt, `an`, wie
  bei der Begrüssung.
- Zeichen zählen wie in [API des Dashboards](api.md), „Einstellung
  speichern“. 32 ist die längste Länge eines Anzeigenamens, siehe
  [Begrüssung bei Beitritt und Abschied](../benutzung/begruessung.md),
  „Platzhalter“.
- Neue Werte gelten für Räume, die danach entstehen. Bestehende Räume
  bleiben, wie sie sind.
- Wechselt `menue` auf einen anderen Kanal, löscht der Bot das Menü im
  alten Kanal, wenn er es noch findet. Im neuen steht es erst nach
  `POST …/sprachraeume/menue`.
- Ist `an` aus, legt der Bot keine neuen Räume an. Bestehende bleiben, bis
  sie leer sind, und das Menü wirkt für sie weiter.

## Menü senden

`POST …/sprachraeume/menue` sendet das Menü in den gespeicherten
Menü-Kanal. Steht dort schon ein Menü des Bots, löscht er es vorher, damit
es nur eins gibt. Wie das Menü aussieht und was die Knöpfe tun, steht in
[Sprachräume](../benutzung/sprachraeume.md), „Menü“. Die Route liest keinen
Body und prüft keinen `Content-Type`, wie die Testnachricht.

| Regel | Code | Feld |
|---|---|---|
| ein Menü-Kanal ist gespeichert | `menue_ohne_kanal` | `menue` |
| der gespeicherte Kanal steht in `GET …/kanaele` | `kanal_unbekannt` | `menue` |
| dort mit `verlauf: true` | `menue_ohne_recht` | `menue` |

Scheitert das Senden bei Discord, `503` `nicht_erreichbar`. Das Menü geht
auch, wenn `an` aus ist. Die Grenze steht in [API des Dashboards](api.md),
„Grenzen je Sitzung“.
