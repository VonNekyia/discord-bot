---
title: API der Begrüssung
description: Die Seiten Beitritt und Abschied im Baukasten des Dashboards; ihre Bausteine, der Kanal und seine Optionen, die Regeln beim Speichern, Bild und Vorschau, die Testnachricht und ihre Grenze je Server.
code:
  - bot/src/module/begruessung/seiten.ts
  - bot/src/module/begruessung/begruessung.ts
  - bot/src/module/begruessung/banner.ts
  - bot/src/module/begruessung/senden.ts
  - bot/src/discord/kanaele.ts
---

# API der Begrüssung

Das Modul Begrüssung meldet im [Baukasten](baukasten.md) zwei Seiten an:
`beitritt` und `abschied`. Beide sind gleich gebaut und stellen ein, was
kitty schickt, wenn jemand kommt oder geht. Was dann in Discord passiert,
steht in [Begrüssung bei Beitritt und Abschied](../benutzung/begruessung.md).
Routen, Typen und das Verhalten der Bausteine stehen im Baukasten; diese
Seite sagt, was die Begrüssung daraus macht.

## Seiten

| Seite | Titel | Bausteine mit Route |
|---|---|---|
| `beitritt` | Beitritt | `bild` (`bild`), `vorschau` (`vorschau`), `test` (`aktion`) |
| `abschied` | Abschied | ebenso |

Die Texte der Bausteine und die Sätze zu den Codes stehen in
`bot/src/module/begruessung/seiten.ts`.

## Bausteine

| ID | Art | Was |
|---|---|---|
| `an` | `schalter` | Aktiv |
| `kanal` | `auswahl` | der Kanal; `leer` heisst „Kein Kanal“, `unbekannt` ist `kanal_unbekannt` |
| `text` | `text` | mehrzeilig, `grenze` 2000, Platzhalter im Text |
| `banner` | `schalter` | braucht `bild`, einen Kanal und dort das Merkmal `banner` |
| `bild` | `bild` | PNG, JPEG oder WebP, 4 MiB, 200 bis 4096 px je Seite |
| `bannerText` | `text` | eine Zeile, `grenze` 100, Platzhalter im Banner |
| `test` | `aktion` | Testnachricht senden |
| `vorschau` | `vorschau`, daneben | das Banner mit 1100 × 440 px; braucht `bild` |

- Die Optionen des Kanals sind die Text- und Ankündigungskanäle, in denen
  der Bot den Kanal sehen und Nachrichten senden darf, als `#name`.
  `gruppe` ist die Kategorie oder `null`. Das Merkmal `banner` hat ein
  Kanal, in dem der Bot auch Dateien anhängen darf.
- Die Optionen sind sortiert wie in Discord: Kanäle ohne Kategorie zuerst,
  dann die Kategorien nach ihrer Position; innerhalb einer Gruppe nach
  Position, bei gleicher Position nach ID. Die Oberfläche sortiert nicht
  um.
- Die längsten Werte der Platzhalter, im Text und im Banner, stehen in
  [Begrüssung bei Beitritt und Abschied](../benutzung/begruessung.md),
  „Platzhalter“; `platzhalter` der beiden Texte trägt sie.
- 2000 Zeichen ist die Grenze von Discord für den Text einer Nachricht
  ([Create Message](https://docs.discord.com/developers/resources/message#create-message)).

## Wert

```ts
type Einstellung = {
  an: boolean;
  kanal: string | null;
  text: string;
  banner: boolean;
  bannerText: string;
  bild: boolean; // nur lesen: ist ein Bild hochgeladen?
};
```

- Ohne gespeicherte Zeile ist der Wert der Standard, siehe
  [Begrüssung bei Beitritt und Abschied](../benutzung/begruessung.md),
  „Standardwerte“.
- `kanal` ist die gespeicherte ID, so wie sie ist, auch wenn es den Kanal
  nicht mehr gibt oder der Bot dort nicht mehr schreiben darf. Dann ist
  `fund` `kanal_unbekannt` am Feld `kanal`; Speichern mit ihr gibt
  denselben Fehler.

## Einstellung speichern

`PUT /api/server/{id}/seiten/{art}` nimmt eine `Einstellung`; `{art}` ist
`beitritt` oder `abschied`. `bild` darf fehlen und wird ignoriert; alle
anderen Felder müssen da sein. Der Bot prüft in dieser Reihenfolge und
antwortet beim ersten Fehler mit `400`, dem Code und dem Feld:

| Feld | Regel | Code |
|---|---|---|
| alle | jedes Feld ausser `bild` da, mit dem richtigen Typ; `text` und `bannerText` ohne NUL (`\0`), weil PostgreSQL es in Text nicht speichert | `ungueltig` |
| `kanal` | `null` oder einer aus den Optionen des Kanals | `kanal_unbekannt` |
| `text` | höchstens 2000 Zeichen, wenn jeder Platzhalter seinen längsten Wert im Text hat | `text_zu_lang` |
| `bannerText` | höchstens 100 Zeichen, wenn jeder Platzhalter seinen längsten Wert im Banner hat | `bannertext_zu_lang` |
| `banner` | `true` nur mit hochgeladenem Bild | `banner_ohne_bild` |
| `banner` | `true` nur mit einem Kanal mit dem Merkmal `banner` | `banner_ohne_recht` |
| `an` | `true` nur mit `kanal` | `an_ohne_kanal` |
| `an` | `true` nur mit nicht leerem `text` oder `banner: true`; Leerzeichen allein zählen als leer | `an_ohne_inhalt` |

- Ist der Body kein JSON-Objekt, fehlt jedes Feld: `ungueltig` mit
  `feld` `an`.
- Zeichen zählen wie in [Baukasten](baukasten.md), „Länge eines Texts“.
- Die Antwort ist `{ wert, meldung }`. `meldung` nennt den Kanal, wenn
  `an` gilt, sonst, dass nichts geschickt wird.

## Bild

`PUT …/{art}/bild` nimmt das Bild roh als Body, nicht als Formular:

| Grenze | Wert | sonst |
|---|---|---|
| `Content-Type` | `image/png`, `image/jpeg` oder `image/webp` | `415` `bildtyp` |
| Grösse | höchstens 4 MiB, also 4 194 304 Byte | `413` `bild_zu_gross` |
| Pixel | höchstens 4096 px je Seite, mindestens 200 px je Seite | `413` `bild_zu_gross` oder `400` `bild_zu_klein` |
| lesbar | die Datei beginnt mit der Signatur von PNG, JPEG oder WebP, egal welcher `Content-Type`, und lässt sich dekodieren | `415` `bild_unlesbar` |

- Der Bot bricht ab, sobald der Body grösser als 4 MiB wird, statt ihn
  ganz zu lesen.
- Breite und Höhe liest er aus dem Kopf der Datei, bevor er dekodiert. So
  legt ein kleines Bild mit riesigen Massen den Bot nicht lahm.
- Jedes Seitenverhältnis geht; das Banner beschneidet mittig, siehe
  [Begrüssung bei Beitritt und Abschied](../benutzung/begruessung.md),
  „Banner“. Am schärfsten ist ein Bild mit 1100 × 440 px oder mehr.
- Ein neues Bild ersetzt das alte. `DELETE …/{art}/bild` löscht es und
  setzt `banner` auf `false`.

`GET …/{art}/vorschau` liefert das Banner so, wie der Bot es senden würde:
mit dem gespeicherten Stand und der angemeldeten Person als Mitglied. Ohne
Bild `404` `kein_bild`. Eine Vorschau vor dem Hochladen gibt es nicht; die
Oberfläche zeigt nach dem Hochladen die Vorschau. Damit reicht `img-src
'self'` für sie.

## Testnachricht

`POST …/{art}/test` schickt die Begrüssung einmal in den gespeicherten
Kanal, so wie der Bot sie bei einem Ereignis schicken würde: mit dem
gespeicherten Stand und der angemeldeten Person als Mitglied, wie bei der
Vorschau.

- Die Antwort ist ein `Satz`: „Gesendet.“ mit dem Kanal. War ein Banner
  gespeichert und ging es nicht mit, etwa weil der Kanal keine Dateien
  mehr zulässt, „Gesendet, ohne Banner.“.
- Sie geht auch, wenn `an` aus ist. So lässt sich vor dem Einschalten
  probieren.
- Sie pingt niemanden, auch nicht mit `{nutzer}` beim Beitritt:
  `allowed_mentions` ist leer.
- Vor dem Text steht die Zeile `-# Testnachricht aus dem Dashboard`, in
  Discord als kleiner, grauer Untertext
  ([Markdown in Discord](https://support.discord.com/hc/en-us/articles/210298617)).
  Wird die Nachricht damit länger als 2000 Zeichen, fällt die Zeile weg.
- Banner und fehlende Rechte gelten wie beim echten Senden, siehe
  [Begrüssung bei Beitritt und Abschied](../benutzung/begruessung.md),
  „Wenn etwas fehlt“: Ohne „Dateien anhängen“ geht nur der Text.
- Die Bremse gilt für Testnachrichten nicht; sie haben die Grenze unten.

Der Bot prüft in dieser Reihenfolge und antwortet beim ersten Fehler mit
`400`, dem Code und dem Feld:

| Regel | Code | Feld |
|---|---|---|
| ein Kanal ist gespeichert | `test_ohne_kanal` | `kanal` |
| der gespeicherte Kanal steht unter den Optionen des Kanals | `kanal_unbekannt` | `kanal` |
| es gibt etwas zu senden: Text, der nicht nur aus Leerzeichen besteht, oder ein Banner, das der Bot im Kanal anhängen darf | `test_ohne_inhalt` | `text` |

Danach gilt die Grenze von 3 Testnachrichten je Minute und Server, über
alle Sitzungen; darüber `429` `zu_viele` mit `Retry-After`. Jede
Testnachricht landet im Kanal, den alle sehen. Die Grenze zählt erst nach
den Rechten und den Regeln, direkt vor dem Senden. Sonst könnte jeder
Angemeldete mit drei Anfragen auf einen fremden Server dessen
Testnachricht sperren und bekäme dafür nur `403`.

Scheitert das Senden bei Discord, `503` `nicht_erreichbar`. Ebenso, wenn
der Text leer ist und das Banner beim Zeichnen scheitert: Dann gibt es
nichts zu senden, obwohl die Regeln oben es erlaubt haben.
