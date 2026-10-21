---
title: Dashboard
description: Die Seite /dashboard/ in web/; ihre Zustände von abgemeldet bis zu den Tabs, wie aus den Seiten des Bots Tabs und Formulare werden, die Bausteine im Code, Speichern, Bild, Aktion und Vorschau, die Debug-Ansicht, wie sie Antworten des Bots prüft, was sie vor dem Senden prüft und welche Meldung sie wann zeigt.
code:
  - web/dashboard/index.html
  - web/src/dashboard.ts
  - web/src/debug.ts
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
| Serverliste | angemeldet | Leiste mit Avatar, Name und „Abmelden“; je Server eine Karte mit Icon und Name; mit `Ich.debug` darunter die Karte „Debug.“ |
| keine Server | `GET /api/server` gibt `[]` | leerer Zustand mit Link zum neuen Anmelden |
| Server | Hash `#server-<id>` mit einem Server aus der Liste | je Seite des Bots ein Tab, siehe „Tabs“; ohne Seite der leere Zustand „Noch nichts einzustellen.“ |
| Debug | Hash `#debug` und `Ich.debug` | die Debug-Ansicht, siehe „Debug“; ohne `Ich.debug` zeigt `#debug` die Liste |

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
  Während die Anfrage läuft, ist der Knopf gesperrt. Danach gilt `wert`
  aus der Antwort als gespeicherter Stand, nicht das Gesendete; `meldung`
  steht unter dem Knopf, und die Vorschau lädt neu. Hat die Seite
  `alleNeu`, etwa das [Board der Module](../schnittstelle/module.md), holt
  das Dashboard stattdessen `GET …/seiten` neu und baut alle Tabs neu,
  siehe „Tabs“.
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
  jedem Laden, damit der Browser nicht das alte Bild zeigt. `breite` und
  `hoehe` des Bausteins stehen als `width` und `height` am `img`; daraus
  folgt sein Seitenverhältnis, auch solange es lädt. Sie zeigt den
  gespeicherten Stand. Ohne Bild steht dort der leere Zustand `leer`;
  scheitert das Laden, `fehler`, weil die Seite den Fehlercode eines `img`
  nicht sieht.

## Tabs

Je Seite ein Tab aus dem Guide, in der Reihenfolge von `GET …/seiten`,
mit `titel` als Name; der erste ist gewählt.

`alleNeu` in `web/src/dashboard.ts` baut die Tabs neu, ohne Skeleton:
nach dem Speichern einer Seite mit `alleNeu` und auf jede Antwort `409`
`modul_aus`. Gewählt bleibt die Seite, von der es ausging; gibt es sie
nicht mehr, der erste Tab. `meldung` des Speicherns steht danach in dieser
Seite unter „Speichern“. Der Satz zu `modul_aus` steht über den Tabs, denn
die Seite ist weg. Was in anderen Tabs ungespeichert war, geht verloren.

Nach dem Neubau bekommt der Knopf „Speichern“ der gewählten Seite den
Fokus; gibt es sie nicht mehr, das Radio des ersten Tabs. So verliert die
Tastatur nicht ihren Platz, wenn der alte Knopf ersetzt ist. Die Meldung
in der Seite setzt `nachDemNeubau` aus `web/src/seite.ts` erst, wenn das
Panel im DOM hängt: Eine Live-Region (`role="status"`) sagt nur an, was
sich ändert, während sie im DOM ist.
Scheitert das Holen, gilt es wie beim Öffnen des Servers, siehe „Zustände“. `web/site.css` hat Regeln für
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
den Werten, wie sie nach dem Laden im Formular standen, und nach dem
Speichern mit `wert` aus der Antwort des Bots; die Reihenfolge der
Schlüssel zählt dabei nicht. Bilder zählen nicht; sie haben ihre eigene
Route. Was
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
| `vergiss` | nimmt einen Fehler aus `melde` wieder weg und zeigt, was die eigene Prüfung findet |
| `aktualisiere` | nach jeder Änderung: Bedingungen, gesperrte Optionen, Zähler, Hinweise |
| `ladeNeu` | nach dem Speichern und Hochladen, etwa die Vorschau |
| `option` | die gewählte Option, für Bedingungen und den Kopf einer Liste |
| `merke` | vor dem Senden: die Reihenfolge einer Liste, die ein Fehler nennt |

Die Umgebung gibt einem Baustein, was er von seiner Seite braucht: IDs,
Sätze, Werte und Optionen anderer Bausteine, die Routen, das Zeigen von
Fehlern und, in einer Liste, die Werte der anderen Einträge. Ein Feld aus
Label, Eingabe, Hilfe und Fehler baut `Feld` in `web/src/kern/feld.ts`.

Texte eines Moduls kommen vom Bot; die Oberfläche erfindet keinen. Ein
`schalter` mit `gesperrt` ist gesperrt und aus, mit `grund` als Hilfe;
`braucht` zählt dann nicht. Ein `link` öffnet in einem neuen Tab. Eine
gesperrte Option einer `auswahl` nennt hinter ihrem Namen `grund`. Mit
`einmalig` ist eine Option, die ein anderer Eintrag der Liste schon gewählt
hat, ebenso gesperrt und nennt `vergeben`; fehlt `vergeben`, steht kein
Text dahinter. Ist eine Option gesperrt und vergeben, steht `grund`. Eine
`liste` hat keine eigene Überschrift.

Eine neue Art kommt zuerst in den Vertrag, dann als Datei hierher und in
`baue` in `web/src/seite.ts`, mit einem Element aus dem Guide.

## Antworten prüfen

`web/src/api/klient.ts` prüft jede Antwort des Bots, bevor die Oberfläche
sie nutzt; behauptet wird kein Typ. Kleine Prüfer (`istText`, `istZahl`,
`oderNull`, `listeVon`, `form` …) sind Typprädikate und setzen sich zu den
grossen zusammen, ohne `as`. Alles liegt in dieser einen Datei, denn die
API-Schicht importiert nichts Eigenes, siehe
[Struktur von Bot und Oberfläche](../entwicklung/struktur.md), „Grenzen“.

| Antwort | wie streng | passt sie nicht |
|---|---|---|
| `Ich`, `Server[]`, `Gespeichert` beim Speichern, `Satz` einer Aktion, `Debug` | jedes Feld | `nicht_erreichbar`, wie eine Antwort ohne JSON |
| `Seite[]`: der äussere Aufbau jeder Seite, `wert` als Objekt, `saetze`, `fund`, `alleNeu`, wenn da | jedes Feld | die ganze Antwort `nicht_erreichbar`; die Seite geht zurück zur Liste |
| ein Baustein | jedes Feld seiner Art aus dem Vertrag; optionale nur, wenn da; weitere Felder zählen nicht; ein `link` nur mit `url` ab `https://discord.com/` | er wird `{ art: 'unbekannt', id }` und zur Warnung an seiner Stelle; die übrigen bleiben |
| eine `liste` | wie ein Baustein, dazu jeder innere Baustein; nur `schalter`, `auswahl`, `text` und `zahl` | die ganze Liste wird zur Warnung |
| der Body eines Fehlers, `Fehler` | `code` als Text, `feld` als Text, wenn da | `nicht_erreichbar` ab 500, sonst `unbekannt` |

Die Prüfer der Antworten stehen in `pruefer`, je Typ unter seinem Namen im
Vertrag; `api` liest jede Antwort über diese Tabelle. Die Prüfer der
Bausteine stehen in einer Tabelle je Art, und `tsc` verlangt einen für jede
Art aus dem Vertrag. Beide misst ein Test an den Beispielen des Vertrags,
siehe [Tests](../entwicklung/tests.md), „Die Oberfläche“.

Hat ein Baustein, der nicht passt, keine `id`, bekommt er eine Ersatz-ID
nach seiner Stelle, damit zwei solche sich auf der Seite nicht
überschreiben. Den Vertrag dazu hält [Baukasten](../schnittstelle/baukasten.md),
„Bausteine“, fest. Ein Element, das in `web/dashboard/index.html` fehlt oder
die falsche Art hat, meldet `element` in `web/src/dashboard.ts` beim Laden
mit seiner ID; es prüft mit `instanceof`.

## Debug

Die Debug-Ansicht zeigt, wie nah der Bot an den Rate-Limits von Discord
ist, nach [API der Debug-Seite](../schnittstelle/debug.md). Sie ist keine
Seite des Baukastens, sondern ein fester Abschnitt (`#debug`) im Rahmen
des Dashboards, gebaut von `web/src/debug.ts`. Ihren Einstieg, die Karte
„Debug.“ unter der Serverliste, gibt es nur mit `Ich.debug`.

| Teil | Element | Inhalt |
|---|---|---|
| Stand | `.help` | Uhrzeit von `jetzt`, die Shards, dass die Ansicht neu lädt |
| Überblick | `.facts` | Anfragen an Discord (Summe über alle Routen), 429 von Discord, wie lange der Prozess läuft |
| Ungültige Anfragen | `.progress` | `letzte10min` gegen `grenze`; ab `warnung` darunter eine `.message-warn` |
| Routen | Tabelle | je Methode und Route: Anfragen, 429, übrig von Limit, Rest bis zum Reset, wann zuletzt; ohne Route ein `.empty` |
| 429 nach Scope | Tabelle | `user`, `global`, `shared` und wie viele `global: true` hatten |
| Eigene Grenzen | Tabelle | je Grenze aus `eigene`, wie oft sie gegriffen hat; ein unbekannter Name steht als Code |

- **Zeiten** rechnet die Ansicht gegen `jetzt` aus der Antwort, nicht gegen
  die Uhr des Browsers. Der Rest bis zum Reset ist `max(0, resetAfter −
  (jetzt − zuletzt))`, aufgerundet auf Sekunden.
- **Neu laden:** beim Öffnen, dann höchstens alle 10 s, nur bei
  `document.visibilityState` `visible`. Wird die Seite wieder sichtbar,
  lädt sie nach, sobald die 10 s um sind. Wer die Ansicht verlässt, stoppt
  das Laden.
- **Fehler:** `401` zeigt die Anmeldung. `403` zeigt den Satz
  `kein_recht_debug` und lädt nicht mehr; der allgemeine Satz zu
  `kein_recht` spricht von Servern. `429` wartet `Retry-After` ab, jeder
  andere Fehler 10 s. Die Meldung steht über dem Inhalt; die letzten Daten
  bleiben stehen.
- **Bis zu den ersten Daten** stehen drei Skeletons da.

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
| über der Serverliste | jeder Fehler beim Öffnen eines Servers ausser `401`, auch beim Neubau der Tabs |
| über den Tabs | `modul_aus`, nachdem die Tabs neu gebaut sind, siehe „Tabs“ |
| im Hero | Anmeldung gescheitert, abgelaufen, nicht erreichbar, Abmelden gescheitert |
| über der Debug-Ansicht | jeder Fehler von `GET /api/debug` ausser `401`, siehe „Debug“ |

`429` nennt die Sekunden aus `Retry-After`. Eine Antwort ohne JSON ab
`500` gilt als nicht erreichbar, ebenso ein `fetch`, das gar keine Antwort
bekommt. Vor einer Aktion fallen Fehler aus früheren Antworten weg; was
die eigene Prüfung findet, bleibt. Ebenso in einer Liste: Ändert sich ein
Feld eines Eintrags, fallen die Fehler aus Antworten an diesem Eintrag weg,
auch der `fund` beim Laden, denn sie galten für den Eintrag, wie er
gesendet wurde. Die anderen Einträge behalten ihre.

## Was noch fehlt

- Ein Hinweis auf ungespeicherte Änderungen, bevor man den Server wechselt.
