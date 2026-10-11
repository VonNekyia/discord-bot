---
title: Dashboard
description: Die Seite /dashboard/ in web/; ihre Zustände von abgemeldet bis Formular, wie Anmelden, Abmelden, Hochladen, Speichern und Vorschau ablaufen, was sie vor dem Senden prüft und welche Meldung sie wann zeigt.
code:
  - web/dashboard/index.html
  - web/src/dashboard.ts
  - web/src/begruessung.ts
  - web/src/api.ts
  - web/src/platzhalter.ts
  - web/src/texte.ts
---

# Dashboard

Unter `/dashboard/` meldet man sich mit Discord an, wählt einen Server und
stellt ein, was kitty bei Beitritt und Abschied schickt. Die Seite ist
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
| Server | Hash `#server-<id>` mit einem Server aus der Liste | Tabs „Beitritt“ und „Abschied“, je ein Formular mit Vorschau |

Der Hash trägt den gewählten Server, so gehen Zurück im Browser und ein
Lesezeichen. Ein Hash mit einem Server, der nicht in der Liste steht,
zeigt die Liste. Scheitert `GET …/kanaele` oder `GET …/begruessung`, geht
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
- **Vorschau:** ein `img` auf `GET …/vorschau` mit einer neuen Query bei
  jedem Laden, damit der Browser nicht das alte Bild zeigt. Sie zeigt den
  gespeicherten Stand. Ohne Bild steht dort der leere Zustand; scheitert
  das Laden, ein leerer Zustand mit „Keine Vorschau.“, weil die Seite den
  Fehlercode eines `img` nicht sieht.

## Formular

Je Art (`beitritt`, `abschied`) ein Formular, `web/src/begruessung.ts`:

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

## Prüfen vor dem Senden

Die Seite prüft dieselben Regeln wie das Backend, damit der Fehler gleich
am Feld steht. Das Backend prüft trotzdem.

| Regel | wie | Quelle |
|---|---|---|
| kein NUL (`\0`) in Text und Text auf dem Banner | Fehler am Feld, vor der Länge; das Backend lehnt NUL als `ungueltig` ab, weil PostgreSQL es in Text nicht nimmt | `bot/src/begruessung.ts`, `pruefe`; [API des Dashboards](../schnittstelle/api.md), „Einstellung speichern“ |
| Länge von Text und Text auf dem Banner | jeder Platzhalter mit seinem längsten Wert, ein Zeichen ist eine UTF-16-Einheit; `web/src/platzhalter.ts` | [API des Dashboards](../schnittstelle/api.md), „Einstellung speichern“; [Begrüssung](../benutzung/begruessung.md), „Platzhalter“ |
| Aktiv braucht einen Kanal | Fehler am Kanal | ebenda |
| Aktiv braucht Text oder Banner | Meldung unter dem Knopf | ebenda |
| Bild: Typ, Grösse, Pixel je Seite, lesbar | Typ und Grösse aus der Datei, Pixel mit `createImageBitmap` | [API des Dashboards](../schnittstelle/api.md), „Bild“ |

## Meldungen

Jeder Fehlercode der API hat einen Satz in `web/src/texte.ts`: Der erste
sagt, was passiert ist, der zweite, was zu tun ist.

| Wo | wann |
|---|---|
| am Feld (`.field-error`, `.error`) | Fehler mit `feld` `kanal`, `text` oder `bannerText`; jeder Fehler beim Bild |
| unter „Speichern“ | Erfolg und jeder andere Fehler beim Speichern |
| über der Serverliste | jeder Fehler beim Öffnen eines Servers ausser `401` |
| im Hero | Anmeldung gescheitert, abgelaufen, nicht erreichbar, Abmelden gescheitert |

`429` nennt die Sekunden aus `Retry-After`. Eine Antwort ohne JSON ab
`500` gilt als nicht erreichbar, ebenso ein `fetch`, das gar keine Antwort
bekommt. `ungueltig` mit `feld` `text` oder `bannerText` bekommt denselben
Satz wie NUL vor dem Senden (`steuerzeichen`), denn die Seite schickt dort
immer einen String.

## Was noch fehlt

- Ein Hinweis auf ungespeicherte Änderungen, bevor man den Server wechselt.
- Eine Testnachricht, sobald die API sie hat, siehe
  [API des Dashboards](../schnittstelle/api.md), „Was noch fehlt“.
