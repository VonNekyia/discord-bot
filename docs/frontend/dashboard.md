---
title: Dashboard
description: Die Seite /dashboard/ in web/; ihre Zustände von abgemeldet bis Formular, wie Anmelden, Abmelden, Hochladen, Speichern, Testnachricht und Vorschau ablaufen, der Tab Sprachräume mit seinen Erzeugern, was sie vor dem Senden prüft und welche Meldung sie wann zeigt.
code:
  - web/dashboard/index.html
  - web/src/dashboard.ts
  - web/src/module/begruessung/begruessung.ts
  - web/src/module/sprachraeume/sprachraeume.ts
  - web/src/api/klient.ts
  - web/src/kern/platzhalter.ts
  - web/src/kern/texte.ts
---

# Dashboard

Unter `/dashboard/` meldet man sich mit Discord an, wählt einen Server und
stellt ein, was kitty bei Beitritt und Abschied schickt und wo
Sprachräume entstehen. Die Seite ist
statisch (`web/dashboard/index.html`), das Skript `web/src/dashboard.ts`
holt alles über die [API des Dashboards](../schnittstelle/api.md). Ohne
Skript geht sie nicht und sagt das, siehe Entscheidung
[0008](../entscheidungen/0008-api-im-bot-prozess.md). Wie die Elemente
aussehen, steht in [Design der Oberfläche](design.md), „Elemente“.

## Zustände

| Zustand | Wann | Was die Seite zeigt |
|---|---|---|
| ohne Skript | JavaScript aus | Hero und eine Warnung im `noscript` |
| abgemeldet | `GET /api/ich` gibt `401` | im Hero den Knopf „Anmelden \| mit Discord“, einen Link auf `/api/anmelden` |
| Anmeldung gescheitert | abgemeldet und `?fehler=anmeldung` in der URL | wie abgemeldet, darunter eine Fehlermeldung; die Query entfernt das Skript aus der URL |
| abgelaufen | eine spätere Anfrage gibt `401` | wie abgemeldet, darunter eine Warnung |
| nicht erreichbar | `GET /api/ich` oder `GET /api/server` scheitert anders, etwa `502` oder `503`; ein einzelner Server führt nie hierher, siehe unten | im Hero nur die Fehlermeldung, ohne Knopf, weil die Anmeldung auch den Bot braucht |
| laden | Serverliste oder Server wird geholt | drei Skeletons |
| Serverliste | angemeldet | Leiste mit Avatar, Name und „Abmelden“; je Server eine Karte mit Icon und Name |
| keine Server | `GET /api/server` gibt `[]` | leerer Zustand mit Link zum neuen Anmelden |
| Server | Hash `#server-<id>` mit einem Server aus der Liste | Tabs „Beitritt“ und „Abschied“, je ein Formular mit Vorschau, und „Sprachräume“, siehe „Sprachräume“ unten |

Der Hash trägt den gewählten Server, so gehen Zurück im Browser und ein
Lesezeichen. Ein Hash mit einem Server, der nicht in der Liste steht,
zeigt die Liste. Beim Öffnen holt die Seite vier Dinge zugleich: `GET
…/kanaele`, `GET …/begruessung`, `GET …/sprachkanaele` und `GET
…/sprachraeume`. Scheitert eins davon, geht
die Seite zurück zur Liste und zeigt die Meldung darüber, etwa bei `403`,
`404`, `429` oder `503`; nur bei `401` zeigt sie die Anmeldung. Ein Server,
der gerade nicht geht, nimmt so nicht die ganze Seite mit: Die anderen
bleiben wählbar, und derselbe lässt sich später noch einmal öffnen.

## Abläufe

- **Anmelden:** ein normaler Link auf `/api/anmelden`, kein Formular und
  kein `fetch`. Der Bot leitet zu Discord und zurück auf `/dashboard/`.
- **Abmelden:** „Abmelden“ schickt `POST /api/abmelden` mit `fetch`. Auf
  `204` zeigt die Seite selbst den Zustand abgemeldet; einen `401` behandelt
  sie genauso.
- **Server wählen:** Die Karte setzt den Hash. Die Seite holt Kanäle und
  Einstellungen zugleich und baut beide Formulare aus dem `template`
  `vorlage-begruessung`.
- **Bild:** Sobald eine Datei gewählt ist, prüft die Seite sie (siehe
  unten) und schickt sie mit `PUT …/bild` roh, mit dem Typ der Datei. Danach
  zeigt sie die Vorschau. „Bild entfernen“ schickt `DELETE …/bild`; das
  Backend setzt `banner` dabei auf `false`, die Seite auch.
- **Speichern:** prüft zuerst selbst, dann `PUT …/begruessung/{art}` mit
  allen Feldern ausser `bild`. Danach steht die Meldung unter dem Knopf, und
  die Vorschau lädt neu.
- **Testnachricht:** „Testnachricht senden“ schickt `POST …/test` ohne
  Body. Der Bot nimmt den gespeicherten Stand, nicht das Formular. Weicht
  das Formular davon ab, sagt die Hilfe unter dem Knopf das; gesperrt wird
  er dafür nicht. Während die Anfrage läuft, ist der Knopf gesperrt und
  heisst „Wird gesendet …“. Auf `200` steht unter ihm „Gesendet.“ mit dem
  gespeicherten Kanal. War ein Banner gespeichert und kommt `banner: false`
  zurück, heisst es „Gesendet, ohne Banner.“; warum, sagt die API nicht.
- **Vorschau:** ein `img` auf `GET …/vorschau` mit einer neuen Query bei
  jedem Laden, damit der Browser nicht das alte Bild zeigt. Sie zeigt den
  gespeicherten Stand. Ohne Bild steht dort der leere Zustand; scheitert
  das Laden, ein leerer Zustand mit „Keine Vorschau.“, weil die Seite den
  Fehlercode eines `img` nicht sieht.

## Formular

Je Art (`beitritt`, `abschied`) ein Formular, `web/src/module/begruessung/begruessung.ts`:

| Feld | Element | Verhalten |
|---|---|---|
| Aktiv | Checkbox | `an` |
| Kanal | Select | „Kein Kanal“ und die Kanäle als `#name`, in der Reihenfolge der API; Kanäle einer Kategorie in einer `optgroup` mit ihrem Namen. Steht die gespeicherte ID nicht in der Liste, ist „Kein Kanal“ gewählt und das Feld zeigt den Fehler zu `kanal_unbekannt` |
| Text | Textarea | die Hilfe nennt die Platzhalter und zeigt beim Tippen, wie viele Zeichen noch frei sind |
| Banner | Checkbox | gesperrt und aus, solange kein Bild da ist, kein Kanal gewählt ist oder der Kanal `banner: false` hat; ein Hinweis darunter sagt, warum |
| Bild | Datei-Feld | lädt sofort hoch, siehe „Abläufe“ |
| Bild entfernen | Link-Knopf | nur sichtbar mit Bild |
| Text auf dem Banner | Textfeld | wie Text, mit der Grenze des Banners |
| Speichern | Primary button | „Speichern \| Beitritt“ oder „Speichern \| Abschied“; gesperrt, solange die Anfrage läuft |
| Testnachricht senden | Link-Knopf unter den Meldungen zu „Speichern“, darunter eine Hilfe und eigene Meldungen | siehe „Abläufe“; kein zweiter Primary button |

## Sprachräume

Der dritte Tab stellt die Sprachräume des Servers ein, nach
[API der Sprachräume](../schnittstelle/sprachraeume.md),
`web/src/module/sprachraeume/sprachraeume.ts`. Was in Discord passiert, steht in
[Sprachräume](../benutzung/sprachraeume.md).

| Teil | Element | Verhalten |
|---|---|---|
| Warnung | `.message-warn` oben | nur bei `ohneKategorie.bereit: false`; nennt die Rechte aus [Sprachräume](../benutzung/sprachraeume.md), „Rechte und Intent“ |
| Aktiv | Checkbox | `an`; darunter eine Hilfe: Jeder Raum bekommt sein Menü im eigenen Textchat, Änderungen gelten für neue Räume |
| Erzeuger | je einer als `.card` in einer `.grid` | Kopfzeile „Erzeuger 1“, mit dem Namen des gewählten Sprachkanals |
| Erzeuger, Feld | Select | die Sprachkanäle in der Reihenfolge der API, je Kategorie eine `optgroup`. Gesperrt: ohne `bereit` („kitty fehlt ein Recht“) und schon in einem anderen Eintrag gewählt („schon gewählt“) |
| Kategorie | Select | „Kategorie des Erzeugers“ (`null`) und die Kategorien; ohne `bereit` gesperrt. Die Hilfe sagt, wo Räume entstehen |
| Name | Textfeld | Hilfe zu `{name}` und wie viele Zeichen frei sind, mit 32 Zeichen für `{name}` gerechnet |
| Limit | Zahl, 0 bis 99 | Hilfe: 0 heisst unbegrenzt |
| Entfernen | Link-Knopf je Karte | nimmt den Eintrag aus der Liste; gespeichert wird erst mit „Speichern“ |
| Erzeuger hinzufügen | Link-Knopf unter der Liste | neuer Eintrag mit `{name}s Raum`, Limit 0, Kategorie `null`, Fokus auf dem Select; bei 10 gesperrt, mit Hinweis |
| kein Erzeuger | `.empty` | solange die Liste leer ist |
| Speichern | Primary button | „Speichern \| Sprachräume“, `PUT …/sprachraeume` mit allen Einträgen in ihrer Reihenfolge |

Gespeicherte IDs, die es nicht mehr gibt, zeigt der Tab wie den Kanal der
Begrüssung: Das Select steht auf „Bitte wählen“ bzw. „Kategorie des
Erzeugers“, und am Feld steht der Satz zu `erzeuger_unbekannt` bzw.
`kategorie_unbekannt`, bis man es ändert. Was gespeichert ist und nicht
mehr geht, etwa ein Erzeuger ohne `bereit`, steht schon beim Laden am Feld.

## Prüfen vor dem Senden

Die Seite prüft dieselben Regeln wie das Backend, damit der Fehler gleich
am Feld steht. Das Backend prüft trotzdem.

| Regel | wie | Quelle |
|---|---|---|
| kein NUL (`\0`) in Text und Text auf dem Banner | Fehler am Feld, vor der Länge; das Backend lehnt NUL als `ungueltig` ab, weil PostgreSQL es in Text nicht nimmt | `bot/src/module/begruessung/begruessung.ts`, `pruefe`; [API der Begrüssung](../schnittstelle/begruessung.md), „Einstellung speichern“ |
| Länge von Text und Text auf dem Banner | jeder Platzhalter mit seinem längsten Wert, ein Zeichen ist eine UTF-16-Einheit; `web/src/kern/platzhalter.ts` | [API der Begrüssung](../schnittstelle/begruessung.md), „Einstellung speichern“; [Begrüssung](../benutzung/begruessung.md), „Platzhalter“ |
| Aktiv braucht einen Kanal | Fehler am Kanal | ebenda |
| Aktiv braucht Text oder Banner | Meldung unter dem Knopf | ebenda |
| Bild: Typ, Grösse, Pixel je Seite, lesbar | Typ und Grösse aus der Datei, Pixel mit `createImageBitmap` | [API der Begrüssung](../schnittstelle/begruessung.md), „Bild“ |
| Sprachräume, je Eintrag: Sprachkanal gewählt, bekannt, `bereit`, nicht doppelt; Kategorie bekannt und `bereit`, bei `null` die des Erzeugers oder `ohneKategorie`; Name ohne NUL, nicht leer, nicht zu lang (`{name}` mit 32 Zeichen); Limit ganze Zahl von 0 bis 99 | je Feld der erste Fehler am Eintrag, in der Reihenfolge des Backends; alle Einträge auf einmal | [API der Sprachräume](../schnittstelle/sprachraeume.md), „Sprachräume einstellen“ |
| Sprachräume: Aktiv braucht einen Erzeuger | Meldung unter dem Knopf | ebenda |

## Meldungen

Jeder Fehlercode der API hat einen Satz in `web/src/kern/texte.ts`: Der erste
sagt, was passiert ist, der zweite, was zu tun ist.

| Wo | wann |
|---|---|
| am Feld (`.field-error`, `.error`) | Fehler mit `feld` `kanal`, `text` oder `bannerText`; jeder Fehler beim Bild |
| am Feld eines Erzeugers | Fehler mit `feld` `erzeuger.<i>.kanal`, `.kategorie`, `.name` oder `.limit`; `i` zählt in der Liste, wie sie gesendet wurde, ab 0 |
| unter der Liste der Erzeuger | Fehler mit `feld` `erzeuger`, etwa `zu_viele_erzeuger` |
| unter „Speichern“ | Erfolg und jeder andere Fehler beim Speichern |
| unter „Testnachricht senden“ | Erfolg und jeder Fehler der Testnachricht ohne `feld`, etwa `429` oder `503`; `test_ohne_kanal` und `kanal_unbekannt` stehen am Kanal, `test_ohne_inhalt` am Text, mit Sätzen, die vom gespeicherten Stand sprechen |
| über der Serverliste | jeder Fehler beim Öffnen eines Servers ausser `401` |
| im Hero | Anmeldung gescheitert, abgelaufen, nicht erreichbar, Abmelden gescheitert |

`429` nennt die Sekunden aus `Retry-After`. Eine Antwort ohne JSON ab
`500` gilt als nicht erreichbar, ebenso ein `fetch`, das gar keine Antwort
bekommt. `ungueltig` mit `feld` `text`, `bannerText` oder
`erzeuger.<i>.name` bekommt denselben Satz wie NUL vor dem Senden
(`steuerzeichen`), denn die Seite schickt dort immer einen String.

## Was noch fehlt

- Ein Hinweis auf ungespeicherte Änderungen, bevor man den Server wechselt.
