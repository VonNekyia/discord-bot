---
title: Dashboard
description: Die Seite /dashboard/ in web/; ihre Zustände von abgemeldet bis zu den Tabs, wie aus den Seiten des Bots Tabs und Formulare werden, die Bausteine im Code, Speichern, Bild, Aktion und Vorschau, was sie vor dem Senden prüft und welche Meldung sie wann zeigt.
code:
  - web/dashboard/index.html
  - web/src/dashboard.ts
  - web/src/seite.ts
  - web/src/bausteine
  - web/src/kern/teil.ts
  - web/src/kern/feld.ts
  - web/src/kern/laenge.ts
  - web/src/kern/texte.ts
  - web/src/api/klient.ts
---

# Dashboard

Unter `/dashboard/` meldet man sich mit Discord an, wählt einen Server und
stellt ein, was kitty dort tut. Was es einzustellen gibt, entscheidet der
Bot: Er liefert je Server die Seiten seiner Module, gebaut aus Bausteinen,
siehe [Baukasten des Dashboards](../schnittstelle/baukasten.md). Die
Oberfläche baut jede Art von Baustein allgemein und kennt kein Modul. Die
Seite ist statisch (`web/dashboard/index.html`), das Skript
`web/src/dashboard.ts` holt alles über die API. Ohne Skript geht sie
nicht und sagt das, siehe Entscheidung
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
| Server | Hash `#server-<id>` mit einem Server aus der Liste | je Seite des Bots ein Tab, siehe „Tabs“; ohne Seite der leere Zustand „Noch nichts einzustellen.“ |

Der Hash trägt den gewählten Server, so gehen Zurück im Browser und ein
Lesezeichen. Ein Hash mit einem Server, der nicht in der Liste steht,
zeigt die Liste. Beim Öffnen holt die Seite `GET …/seiten`. Scheitert
das, geht die Seite zurück zur Liste und zeigt die Meldung darüber, etwa
bei `403`, `404`, `429` oder `503`; nur bei `401` zeigt sie die
Anmeldung. Ein Server, der gerade nicht geht, nimmt so nicht die ganze
Seite mit: Die anderen bleiben wählbar, und derselbe lässt sich später
noch einmal öffnen.

## Abläufe

- **Anmelden:** ein normaler Link auf `/api/anmelden`, kein Formular und
  kein `fetch`. Der Bot leitet zu Discord und zurück auf `/dashboard/`.
- **Abmelden:** „Abmelden“ schickt `POST /api/abmelden` mit `fetch`. Auf
  `204` zeigt die Seite selbst den Zustand abgemeldet; einen `401` behandelt
  sie genauso.
- **Server wählen:** Die Karte setzt den Hash. Die Seite holt die Seiten
  und baut aus jeder einen Tab, siehe „Eine Seite“.
- **Speichern:** prüft zuerst selbst, siehe „Prüfen vor dem Senden“, dann
  `PUT …/seiten/{seite}` mit den Werten aller Bausteine ausser Bildern.
  Während die Anfrage läuft, ist der Knopf gesperrt. Danach steht
  `meldung` aus der Antwort unter dem Knopf, und die Vorschau lädt neu.
- **Bild:** Sobald eine Datei gewählt ist, prüft die Seite sie und
  schickt sie mit `PUT …/{baustein}` roh, mit dem Typ der Datei. Danach
  gilt das Bild als da: Bedingungen, die es brauchen, sind erfüllt, und die
  Vorschau lädt. Der Link-Knopf zum Entfernen schickt `DELETE …/{baustein}`.
- **Aktion:** Der Link-Knopf schickt `POST …/{baustein}` ohne Body. Der
  Bot nimmt den gespeicherten Stand, nicht das Formular. Weicht das
  Formular davon ab, sagt die Hilfe darunter das; gesperrt wird die Aktion
  dafür nicht. Während die Anfrage läuft, ist der Knopf gesperrt und trägt
  `laeuft`. Die Antwort steht als Erfolg darunter.
- **Vorschau:** ein `img` auf `GET …/{baustein}` mit einer neuen Query bei
  jedem Laden, damit der Browser nicht das alte Bild zeigt. Sie zeigt den
  gespeicherten Stand. Ohne Bild steht dort der leere Zustand `leer`;
  scheitert das Laden, `fehler`, weil die Seite den Fehlercode eines `img`
  nicht sieht.

## Tabs

Je Seite ein Tab aus dem Guide, in der Reihenfolge von `GET …/seiten`,
mit `titel` als Name; der erste ist gewählt. `web/site.css` hat Regeln für
die Tabs 1 bis 6, siehe [Design der Oberfläche](design.md), „Vom
Orchestrator festgelegt“. Mehr Seiten zeigt das Dashboard nicht; der Bot
meldet auch nicht mehr an, siehe [Baukasten](../schnittstelle/baukasten.md),
„Routen“.

## Eine Seite

`web/src/seite.ts` baut aus einer Seite ihr Panel:

1. ein `form.form` mit den Bausteinen der Seite in ihrer Reihenfolge,
   ausser `aktion`;
2. darunter der Primary button „Speichern \| <titel>“ und die Meldungen
   zum Speichern;
3. darunter die Bausteine `aktion`;
4. mit `daneben` stehen Formular und `daneben` als `.grid.grid-2`
   nebeneinander, sonst steht das Formular allein.

Beim Laden prüft die Seite jeden Baustein, ohne Pflichtfelder, und zeigt
dann `fund` am Feld. Was so am Feld steht, ging schon gespeichert nicht,
etwa ein Kanal, den es nicht mehr gibt. Geht `fund` an kein Feld, ohne
`feld` oder an einem `schalter`, steht es als `.message-warn` unter
„Speichern“.

Ob das Formular vom gespeicherten Stand abweicht, vergleicht die Seite mit
den Werten, wie sie nach dem Laden und nach dem letzten Speichern im
Formular standen. Bilder zählen nicht; sie haben ihre eigene Route. Was
ein Baustein selbst ändert, etwa ein gesperrter Schalter, der ausgeht,
zählt als gespeichert, denn der Bot hält es ebenso: Ohne Bild löscht er
das Banner, und ohne „Dateien anhängen“ schickt er es nicht.

IDs im Dokument sind `<seite>-<id>`, in einer Liste
`<seite>-<liste>-<n>-<id>` mit einer Zahl, die beim Hinzufügen steigt.
Jedes Label zeigt mit `for` auf sein Feld; Hilfe und Fehler hängen über
`aria-describedby` daran, ein Fehler setzt `aria-invalid`.

## Bausteine

Je Art eine Datei in `web/src/bausteine/`, etwa `auswahl.ts`. Jede gibt
eine Funktion heraus, die aus der Beschreibung des Bots, der Umgebung und
dem gespeicherten Wert einen Teil baut. Ein Baustein importiert keinen
anderen; `seite.ts` bindet alle ein.

| Teil, `web/src/kern/teil.ts` | wofür |
|---|---|
| `elemente` | was in das Formular kommt, je mit dem Abstand von `.form` |
| `wert` | der Wert für `PUT …/seiten/{seite}` |
| `pruefe` | prüft, was der Baustein beschreibt, und zeigt den Fehler am Feld |
| `melde` | zeigt den Fehler zu einem Code aus einer Antwort am Feld, auch in einer Liste |
| `aktualisiere` | nach jeder Änderung: Bedingungen, gesperrte Optionen, Zähler, Hinweise |
| `ladeNeu` | nach dem Speichern und Hochladen, etwa die Vorschau |
| `option` | die gewählte Option, für Bedingungen und den Kopf einer Liste |
| `merke` | vor dem Senden: die Reihenfolge einer Liste, die ein Fehler nennt |

Die Umgebung gibt einem Baustein, was er von seiner Seite braucht: IDs,
Sätze, Werte und Optionen anderer Bausteine, die Routen, das Zeigen von
Fehlern und, in einer Liste, die Werte der anderen Einträge. Ein Feld aus
Label, Eingabe, Hilfe und Fehler baut `Feld` in `web/src/kern/feld.ts`.

Eine neue Art kommt zuerst in den Vertrag, dann als Datei hierher und in
`baue` in `web/src/seite.ts`, mit einem Element aus dem Guide.

## Prüfen vor dem Senden

Die Seite prüft, was ein Baustein selbst beschreibt, in der Reihenfolge
des Bots, damit der Fehler gleich am Feld steht. Welche Regeln das sind,
steht in [Baukasten](../schnittstelle/baukasten.md), „Prüfen in der
Oberfläche“. Der Bot prüft trotzdem, und Regeln über mehrere Felder prüft
nur er.

| Was | wie |
|---|---|
| alle Felder | je Feld der erste Fehler, alle auf einmal, auch in jedem Eintrag einer Liste |
| Länge eines Texts | `laenge` in `web/src/kern/laenge.ts`; der Satz sagt, um wie viele Zeichen zu kürzen ist |
| Bild | Typ und Grösse aus der Datei, Pixel mit `createImageBitmap` |

## Meldungen

Den Satz zu einem Code liefert die Seite in `saetze`. Für allgemeine
Codes hat `web/src/kern/texte.ts` einen Satz: Der erste sagt, was
passiert ist, der zweite, was zu tun ist.

| Wo | wann |
|---|---|
| am Feld (`.field-error`, `.error`) | Fehler aus der eigenen Prüfung; Fehler einer Antwort, deren `feld` einen Baustein mit Feld nennt, auch `<liste>.<i>.<id>` |
| unter einer Liste | Fehler mit `feld` gleich der Liste, etwa zu viele Einträge |
| am Bild | jeder Fehler beim Hochladen und Entfernen |
| unter „Speichern“ | Erfolg und jeder andere Fehler beim Speichern, auch mit `feld` an einem Schalter |
| unter einer Aktion | Erfolg und jeder Fehler der Aktion ohne Feld; mit Feld steht er dort |
| über der Serverliste | jeder Fehler beim Öffnen eines Servers ausser `401` |
| im Hero | Anmeldung gescheitert, abgelaufen, nicht erreichbar, Abmelden gescheitert |

`429` nennt die Sekunden aus `Retry-After`. Eine Antwort ohne JSON ab
`500` gilt als nicht erreichbar, ebenso ein `fetch`, das gar keine Antwort
bekommt. Vor einer Aktion fallen Fehler aus früheren Antworten weg; was
die eigene Prüfung findet, bleibt.

## Was noch fehlt

- Ein Hinweis auf ungespeicherte Änderungen, bevor man den Server wechselt.
