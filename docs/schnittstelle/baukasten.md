---
title: Baukasten des Dashboards
description: Wie das Dashboard aus Seiten und Bausteinen besteht, die die Module des Bots anmelden; Routen, Typen, jede Art von Baustein mit ihrem Verhalten, Fehler am Feld und was die Oberfläche selbst prüft.
code:
  - bot/src/kern/baukasten.ts
  - bot/src/discord/kontext.ts
  - bot/src/api/server.ts
  - bot/src/index.ts
---

# Baukasten des Dashboards

Was das Dashboard zeigt, entscheidet der Bot. Jedes Modul meldet Seiten
an. Eine Seite ist ein Tab aus Bausteinen wie Schalter, Auswahl oder Text,
mit Werten, Optionen und Texten. Die Oberfläche kennt jede Art von
Baustein und baut die Seiten so, wie sie kommen; ein Modul kennt sie
nicht. Warum, steht in
[0017](../entscheidungen/0017-dashboard-als-baukasten.md). Grundregeln,
Anmeldung, Grenzen und das Format der Fehler gelten wie in
[API des Dashboards](api.md).

## Routen

| Methode und Pfad | Antwort |
|---|---|
| `GET /api/server/{id}/seiten` | `200` `Seite[]`, in der Reihenfolge der Tabs |
| `PUT /api/server/{id}/seiten/{seite}` | `200` `{ wert: Eintrag, meldung: Satz }`, so wie gespeichert |
| `PUT /api/server/{id}/seiten/{seite}/{baustein}` | `204`; die Datei eines `bild`, roh als Body |
| `DELETE /api/server/{id}/seiten/{seite}/{baustein}` | `204`; die Datei eines `bild` ist gelöscht |
| `GET /api/server/{id}/seiten/{seite}/{baustein}` | `200` `image/png`; das Bild einer `vorschau` |
| `POST /api/server/{id}/seiten/{seite}/{baustein}` | `200` `Satz`; die `aktion` ist ausgeführt |

- `{seite}` und `{baustein}` sind IDs, die ein Modul anmeldet. Welche es
  gibt, steht auf der Seite des Moduls: [API der Begrüssung](begruessung.md),
  [API der Sprachräume](sprachraeume.md).
- Eine ID beginnt mit einem Kleinbuchstaben und hat nur Buchstaben und
  Ziffern, höchstens 32 Zeichen.
- Eine Route unter `…/{baustein}` hat nur ein Baustein der Art `bild`,
  `vorschau` oder `aktion`, mit den Methoden aus der Tabelle.
- Eine unbekannte Seite, ein unbekannter Baustein oder eine Methode, die
  seine Art nicht hat, gibt `404` `nicht_gefunden`, noch vor Sitzung und
  Rechten.
- `PUT …/{seite}` nimmt die Werte der Seite als JSON, so wie in `wert`.
  Den Wert eines `bild` ändert nur seine eigene Route; fehlt er im Body,
  zählt das nicht als Fehler. Was nicht passt, gibt `400` mit Code und
  `feld`, siehe „Fehler am Feld“.
- `PUT …/{baustein}`: Die Oberfläche schickt die Datei so, wie sie gewählt
  wurde, mit ihrem Typ als `Content-Type`.
- `GET …/{baustein}`: Eine Query wird ignoriert. Die Oberfläche hängt eine
  neue an, damit der Browser das Bild neu lädt.
- `POST …/{baustein}` liest keinen Body und prüft keinen `Content-Type`.
- Höchstens 6 Seiten, eine je Tab. Meldet ein Modul mehr, eine ID doppelt
  oder einen Baustein mit Route ohne die Funktion dazu, endet der Bot beim
  Start mit Exit 1.

## Typen

```ts
type Wert = boolean | number | string | null | Eintrag[];
type Eintrag = { [feld: string]: Wert };
type Satz = { titel: string; text: string };
type Fund = { code: string; feld?: string };

type Seite = {
  id: string;
  titel: string; // Name des Tabs und zweiter Teil des Knopfs „Speichern“
  bausteine: Baustein[]; // das Formular, oben nach unten
  daneben: Baustein[]; // neben dem Formular, etwa eine Vorschau; oft leer
  wert: Eintrag; // der gespeicherte Stand, ein Feld je Baustein mit Wert
  saetze: Record<string, Satz>; // der Satz zu jedem Code dieser Seite
  fund: Fund | null; // was der gespeicherte Stand heute nicht mehr besteht
};

type Option = {
  id: string;
  name: string; // so, wie die Oberfläche ihn zeigt
  gruppe: { id: string; name: string } | null;
  merkmale: string[]; // für Bedingungen, etwa "banner"
  gesperrt: { grund: string; code: string } | null;
};

// Erfüllt, wenn der Wert von `feld` gesetzt ist: nicht null, false oder
// leer. Mit `merkmal` muss dazu die gewählte Option der Auswahl `feld`
// dieses Merkmal haben.
type Bedingung = { feld: string; merkmal?: string; sonst: string };

type Baustein =
  | { art: 'schalter'; id: string; titel: string; hilfe?: string; braucht?: Bedingung[] }
  | { art: 'auswahl'; id: string; titel: string; hilfe?: string; leer: string; optionen: Option[];
      unbekannt: string; pflicht?: string; einmalig?: string }
  | { art: 'text'; id: string; titel: string; hilfe?: string; mehrzeilig: boolean; grenze: number;
      platzhalter: Record<string, number>; rechnung?: string; pflicht?: string }
  | { art: 'zahl'; id: string; titel: string; hilfe?: string; min: number; max: number; ungueltig: string }
  | { art: 'bild'; id: string; titel: string; hilfe?: string; typen: string[]; groesse: number;
      pixel: { min: number; max: number }; entfernen: string }
  | { art: 'vorschau'; id: string; titel: string; alt: string; breite: number; hoehe: number;
      braucht: string; leer: Satz; fehler: Satz }
  | { art: 'aktion'; id: string; titel: string; laeuft: string; hilfe?: string; ungespeichert?: string }
  | { art: 'liste'; id: string; titel: string; eintrag: string; kopf?: string; hoechstens: number;
      hinzufuegen: string; entfernen: string; voll: string; leer: Satz; neu: Eintrag;
      bausteine: Baustein[] } // nur schalter, auswahl, text und zahl
  | { art: 'hinweis'; id: string; ton: 'info' | 'warn'; satz: Satz };
```

- Jeder Text ist reiner Text, kein HTML. In `hilfe` zeigt die Oberfläche
  ein `{wort}` als Code.
- `saetze`: Ein Satz hat zwei Teile. Der erste sagt, was passiert ist,
  der zweite, was zu tun ist. Codes, die alle Seiten melden können, etwa
  `nicht_erreichbar` oder `zu_viele`, übersetzt die Oberfläche selbst,
  siehe [API des Dashboards](api.md), „Fehler“.
- `fund`: Der Bot prüft den gespeicherten Stand wie beim Speichern und
  nennt die erste Regel, die nicht passt, etwa einen Kanal, den es nicht
  mehr gibt. Die Oberfläche zeigt ihn beim Laden am Feld.
- `wert` kommt so, wie er gespeichert ist, auch mit IDs, die es nicht mehr
  gibt.

## Bausteine

| Art | Wert | Was die Oberfläche tut |
|---|---|---|
| `schalter` | `boolean` | Checkbox mit `titel`. Mit `braucht`: Ist eine Bedingung nicht erfüllt, ist er gesperrt und aus, und `sonst` der ersten steht als Hilfe darunter |
| `auswahl` | `string` oder `null` | Select. `leer` ist die Option für `null`. Die Optionen kommen in ihrer Reihenfolge; Optionen mit derselben `gruppe` hintereinander stehen in einer Gruppe. Eine gesperrte Option ist nicht wählbar und nennt `grund` hinter ihrem Namen |
| `text` | `string` | Textfeld, mit `mehrzeilig` eine Textarea. Die Hilfe zeigt, wie viele Zeichen frei sind, gerechnet wie unter „Länge eines Texts“, mit `rechnung` als Zusatz |
| `zahl` | `number` | Zahlfeld von `min` bis `max` in Schritten von 1 |
| `bild` | `boolean`, ob eine Datei da ist | Datei-Feld für `typen`. Prüft die Datei, lädt sie sofort hoch und setzt den Wert auf `true`. Darunter ein Link-Knopf `entfernen`, nur mit Datei; er löscht sie und setzt den Wert auf `false` |
| `vorschau` | – | Bild mit `breite` und `hoehe`, `alt` und `titel` als Unterschrift. Lädt neu nach dem Speichern und nach jedem Hochladen. Ist der Wert von `braucht` nicht `true`, der leere Zustand `leer`; scheitert das Laden, `fehler` |
| `aktion` | – | Link-Knopf unter „Speichern“. Während die Anfrage läuft, gesperrt und mit der Beschriftung `laeuft`. Die Antwort steht als Erfolg darunter. Weicht das Formular vom gespeicherten Stand ab, hängt `ungespeichert` an die Hilfe |
| `liste` | `Eintrag[]` | Je Eintrag eine Karte mit `bausteine`. Ihr Kopf ist `eintrag` mit Nummer und, mit `kopf`, dem Namen der Option, die in der Auswahl `kopf` gewählt ist. `hinzufuegen` legt einen Eintrag mit `neu` an, bis `hoechstens`; dann ist der Knopf gesperrt, und `voll` steht darunter. `entfernen` je Karte. Ohne Eintrag der leere Zustand `leer` |
| `hinweis` | – | Meldung mit `satz`, im Ton `ton`, an ihrer Stelle im Formular |

Die Oberfläche baut die Bausteine einer Seite in ihrer Reihenfolge, nur
`aktion` steht unter „Speichern“. Welches Element des Design-Guides zu
welcher Art gehört, steht in [Dashboard](../frontend/dashboard.md). Eine
Art, die die Oberfläche nicht kennt, zeigt sie als Warnung an ihrer
Stelle.

## Länge eines Texts

Ein Zeichen ist eine UTF-16-Einheit, also `String.length` in JavaScript.
Ein Emoji zählt so oft zwei. Das ist nie weniger, als Discord zählt; ein
Text, der hier passt, passt auch bei Discord. Jeder Platzhalter `{name}`
aus `platzhalter` zählt mit seinem längsten Wert, so oft er vorkommt. Mit
`platzhalter: { name: 32 }` ist `{name}s Raum` also 37 Zeichen lang.

## Prüfen in der Oberfläche

Vor dem Senden prüft die Oberfläche, was ein Baustein selbst beschreibt.
Je Feld steht der erste Fehler, alle Felder auf einmal; beim Laden nur
das, was schon gespeichert nicht geht.

| Art | Regel, in dieser Reihenfolge | Satz |
|---|---|---|
| `auswahl` | der Wert steht unter den Optionen, bis man wählt | `unbekannt` |
| `auswahl` | mit `pflicht`: etwas gewählt, nur beim Speichern | `pflicht` |
| `auswahl` | die Option ist nicht gesperrt | ihr `code` |
| `auswahl` | mit `einmalig`: kein anderer Eintrag der Liste hat dieselbe gewählt | `einmalig` |
| `text` | kein NUL (`\0`) | `steuerzeichen` der Oberfläche |
| `text` | mit `pflicht`: nicht leer und nicht nur Leerzeichen, nur beim Speichern | `pflicht` |
| `text` | höchstens `grenze` Zeichen, siehe „Länge eines Texts“ | einer der Oberfläche, mit der Zahl zu viel |
| `zahl` | eine ganze Zahl von `min` bis `max` | `ungueltig` |
| `bild` | Typ aus `typen`, höchstens `groesse` Byte, lesbar, `pixel.min` bis `pixel.max` je Seite | `bildtyp`, `bild_zu_gross`, `bild_unlesbar`, `bild_zu_klein` |

Regeln über mehrere Felder, etwa „Aktiv braucht einen Kanal“, prüft nur
der Bot. Ihr Fehler kommt mit dem `400` zurück.

## Fehler am Feld

Ein Fehler einer Seite nennt in `feld` den Pfad zum Feld:

- die `id` eines Bausteins, etwa `kanal`;
- in einer Liste `<liste>.<i>.<id>`, etwa `erzeuger.1.name`, mit `i` ab 0
  in der Reihenfolge, wie die Liste gesendet wurde;
- `<liste>` allein für die Liste, etwa bei zu vielen Einträgen.

Die Oberfläche zeigt den Satz am Feld. Ohne `feld`, oder mit `feld` an
einem `schalter`, steht er unter dem Knopf, der die Anfrage ausgelöst hat.
`ungueltig` an einem `text` bekommt den Satz zu `steuerzeichen`, denn die
Oberfläche schickt dort immer Text.

## Ein Modul anmelden

Ein Modul gibt ein `Bereich` aus `bot/src/kern/baukasten.ts` heraus:

| Teil | Wofür |
|---|---|
| `seiten` | die IDs seiner Seiten, je mit den Bausteinen, die eine Route haben, und ihrer Art |
| `zeige` | die Seiten für einen Server, mit Werten, Optionen und `fund` |
| `speichere` | prüft und speichert eine Seite; gibt `wert` und `meldung` |
| `ladeHoch`, `loesche` | Datei eines `bild` |
| `zeichne` | Bild einer `vorschau` |
| `loeseAus` | eine `aktion` |

Ein erwarteter Fehler ist ein `BausteinFehler` mit Status, Code, Feld und,
bei `429`, den Sekunden für `Retry-After`. `bot/src/index.ts` reicht die
Bereiche der API in der Reihenfolge der Tabs. Ein neues Modul mit
Oberfläche beschreibt seine Seiten zuerst auf einer eigenen Seite hier
unter `docs/schnittstelle/` (`AGENTS.md`, „Rollen“).

## Was noch fehlt

- Seiten, die nicht an einem Server hängen, etwa die Debug-Seite aus
  [0016](../entscheidungen/0016-debug-im-speicher-fuer-den-eigentuemer.md).
  Alle Routen hier tragen `{id}` und prüfen „Server verwalten“; eine
  solche Seite braucht eigene Routen und eigene Rechte.
