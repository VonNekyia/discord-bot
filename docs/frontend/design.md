---
title: Design der Oberfläche
description: Die Regeln, nach denen web/ aussieht; Tokens, Schrift, Breakpoints, welches Element des Design-Guides wofür steht, woher jede CSS-Regel kommt.
code:
  - web/site.css
  - web/index.html
  - web/dashboard/index.html
  - web/src/main.ts
  - web/src/bausteine
  - docs/frontend/design.html
  - docs/frontend/design.css
---

# Design der Oberfläche

Die Oberfläche sieht aus wie Terranova. Massgeblich ist der Design-Guide
in [`design.html`](design.html) mit [`design.css`](design.css). Der
Frontend-Developer baut nur Elemente, die der Guide zeigt, so wie er sie
zeigt, mit seinen Tokens. Diese Seite sagt, wie das in `web/` umgesetzt
ist.

## Harte Regeln

1. **Nur Tokens.** Farben, Schriften, Abstände und Zeiten kommen aus den
   Tokens am `:root` von `web/site.css`. Kein neuer Farbwert ohne Namen;
   ein neuer Name kommt nur aus dem Guide.
2. **Nur Elemente aus dem Guide.** Was der Guide nicht hat, baut niemand.
   Der Frontend-Developer fragt den Orchestrator.
3. **Elemente mit „ready“** sind im Guide beschrieben, aber noch nirgends
   gebaut. Wer eins braucht, baut es genau nach dem Guide.
4. **Content-Security-Policy.** Kein `style="…"`, kein Skript im HTML,
   nichts von anderen Hosts, keine Web-Fonts, siehe
   [Auslieferung](auslieferung.md).
5. **Geht ohne Skript.** Das Skript macht es nur angenehmer. Ausnahme ist
   das Dashboard: Es setzt Skript voraus und sagt ohne Skript in einem
   `noscript`, dass es eins braucht, siehe Entscheidung
   [0008](../entscheidungen/0008-api-im-bot-prozess.md).
6. **Von 320 px an** ohne seitliches Scrollen.
7. **Fokus sichtbar:** der goldene Ring bleibt. Links nur mit Symbol haben
   `aria-label`.
8. **Deutsch, mit du.** Überschriften enden mit Punkt, Labels sind
   Substantive.
9. **Bilder:** WebP oder PNG mit `width` und `height`, Pixel-Art nur in
   ganzen Vielfachen. Das Logo von kitty ist das Nekyia-Logo, eine
   Katze im Profil: `web/favicon.ico` (16, 32 und 48 px) und
   `web/logo192.png`, beide aus derselben Vorlage in 1024 px.

## Tokens

Wörtlich aus `design.css`, gleiche Namen.

| Gruppe | Tokens |
|---|---|
| Grund | `--paper`, `--cream`, `--card` |
| Dunkel | `--ink`, `--ink-soft`, `--forest`, `--forest-light`, `--night` |
| Akzent | `--gold`, `--gold-light`, `--umber`, `--sage`, `--sage-light` |
| Text | `--muted`, `--on-dark`, `--on-dark-soft` |
| Linien, Schatten, Schleier | `--line`, `--white-line`, `--shadow`, `--shadow-small`, `--veil` |
| Schrift | `--serif`, `--sans`, `--mono` |
| Raum | `--max-width`, `--radius`, `--gutter`, `--section` |
| Bewegung | `--fast`, `--calm`, `--ease` |

Gold nie als Text auf hellem Grund; dort steht `--umber`.

## Schrift

- Überschriften in `--serif` (Georgia), Gewicht 500; Betonung kursiv, auf
  dunklem Grund `--gold-light`, auf hellem `--umber`.
- Text, Labels und Bedienung in `--sans`, 16 px, Zeilenhöhe 1,65.
- Befehle und Code in `--mono`, 0,86 em.
- Text nie breiter als etwa 70 Zeichen.

## Breakpoints

460, 760, 960, 1100, 1200 und 1600 px, wie im Guide. `web/site.css`
nutzt heute 960 und 760 px:

- Unter 960 px hat `.grid-3` zwei Spalten.
- Unter 760 px haben Abschnitt und Hero 20 px Rand, `.grid-2` und
  `.grid-3` eine Spalte, und die Header bar steht nicht mehr über dem
  Hero, sondern im Fluss.

## Elemente

| Was in `web/` | Klasse | Element im Guide |
|---|---|---|
| Kopf der Seite | `.hero`, `.hero-inner`, `.hero-copy` | Hero oben auf dem Guide |
| Knöpfe im Hero der Startseite: Dashboard, Quelltext | `.button` mit `span` und `strong`; Quelltext mit `.button-quiet` | Actions, „Primary button“ und „Quiet and small buttons“; vom Orchestrator festgelegt |
| Abschnitte | `.section`, `.ground-cream`, `.section-heading`, `.lead` | Grundfarben im Wechsel, „Sections“ |
| Kleine Zeile über Überschriften | `.eyebrow`, `.eyebrow-dark` | Content, „Eyebrow“ |
| Liste der Befehle | `.table-wrap` mit `table`, Befehl in `code` | Content, „Table, keys and code“ |
| Fuss | `.footer` | Fuss des Guides |

Im [Dashboard](dashboard.md) dazu:

| Was in `web/dashboard/` | Klasse | Element im Guide |
|---|---|---|
| Leiste mit Wortmarke, Person und Abmelden | `.header-bar` mit `.wordmark`; Abmelden als `.button.button-small.button-quiet` | Navigation, „Header bar“; Actions, „Quiet and small buttons“; vom Orchestrator festgelegt |
| Anmelden, Speichern | `.button` mit `span` und `strong` | Actions, „Primary button“ |
| Serverliste | `.grid.grid-3` mit `a.card`, `.card-icon`, `.kicker`, `h4` | Content, „Cards“ |
| Laden | `.skeleton` in `.grid.grid-3` | Feedback, „Loading and empty states“ |
| Kein Server, keine Seite | `.empty` | Feedback, „Loading and empty states“ |
| je Seite ein Tab | `.tabs` mit `#tab-1` bis `#tab-6` | Navigation, „Tabs“ |
| Formular einer Seite | `.form` | Inputs, „Text fields and text area“ |
| Meldungen | `.message` mit `.message-ok`, `.message-warn`, `.message-error`, `.message-info` | Feedback, „Messages“ |

Je Art von Baustein, siehe [Baukasten](../schnittstelle/baukasten.md),
„Bausteine“:

| Art | Klasse | Element im Guide |
|---|---|---|
| `schalter` | `label.choice` mit Checkbox, darunter `.help` | Inputs, „Checkbox, radio and switch“; Checkbox statt Switch, vom Orchestrator festgelegt |
| `auswahl` | `select` in `.field`, Gruppen als `optgroup` | Inputs, „Select“ |
| `text` | `input type="text"` oder `textarea` in `.field`, mit `.help` und `.error` | Inputs, „Text fields and text area“ |
| `zahl` | `input type="number"` in `.field` | Inputs, „Text fields and text area“; vom Orchestrator festgelegt |
| `bild` | Datei-Feld in `.field`, darunter `button.link-button` zum Entfernen | fehlt im Guide; vom Orchestrator festgelegt |
| `vorschau` | `.figure-card` mit `.picture` und `img`; ohne Bild `.empty` | Media, „Picture with caption“; vom Orchestrator festgelegt |
| `aktion` | `button.link-button`, darunter `.help` und Meldungen | Actions, „Links“, „In text“; vom Orchestrator festgelegt |
| `liste` | `.grid` mit je einem `article.card`, darin `.form` mit `.kicker` als Kopf; `.empty`; `button.link-button` zum Hinzufügen und Entfernen | Content, „Cards“; vom Orchestrator festgelegt |
| `hinweis` | `.message-warn` oder `.message-info` | Feedback, „Messages“ |
| eine Art, die die Oberfläche nicht kennt | `.message-warn` | Feedback, „Messages“ |

## Herkunft der Regeln

Der Guide liegt in der Fassung vom Commit `0dd0695` des Website-Repos von
Terranova (Stand 2026-10-10), unter MIT, siehe [`LICENSE`](LICENSE).
Ändert sich der Guide dort, kommen `design.html` und `design.css` in einer
eigenen PR neu, mit dem neuen Commit hier.

`web/site.css` besteht aus Blöcken, die wörtlich aus `design.css` kommen:
Tokens und Grundregeln, Hero, Abschnitte, Eyebrow, Knopf, Tabelle, Fuss;
für das Dashboard `h4`, Raster, kleine und stille Knöpfe, der gesperrte
Knopf, Karte, Formular, Header bar mit Wortmarke, Tabs, Meldungen,
Skeleton, leerer Zustand und Bild mit Unterschrift; dazu die Breakpoints
960 und 760 px und reduzierte Bewegung. Aus `.demo-header` wird dabei
`.header-bar`, mit denselben Regeln. Zwei Regeln kommen von der Website
selbst, weil der Guide sie nur beschreibt: `.hero-actions` und
`.js .reveal`. Eine neue Regel kommt ebenso wörtlich aus dem Guide, oder
der Orchestrator legt sie fest.

## Vom Orchestrator festgelegt

Was der Guide nicht zeigt, legt der Orchestrator fest. Diese Regeln stehen
am Ende von `web/site.css` und nutzen nur Werte, die schon in `design.css`
stehen. Stand 2026-10-11, alle für das [Dashboard](dashboard.md).

| Regel | Was sie tut |
|---|---|
| `[hidden]` | `display: none !important`; sonst schlägt `display` von `.button`, `.grid` und anderen das Attribut `hidden` |
| `.hero > .header-bar` | Header bar über dem Hero: `position: absolute`, oben 18 px, links und rechts `--gutter`. Unter 760 px im Fluss mit `margin: 18px 20px 0`, weil sie dort zweizeilig wird |
| `.wordmark img` | Logo und Avatar statt des Verlaufs `i`, 34 px, Ecken 9 px wie `.wordmark i`; ohne Avatar steht `i` |
| `.person` | die Person in der Leiste rückt nach rechts, `margin-left: auto` wie `.menu` |
| `.name` | Namen von Discord brechen auch ohne Leerzeichen um, `overflow-wrap: anywhere` |
| `a.card`, `a.card:hover` | Karte als Link, ohne Unterstreichung. Nur sie hebt sich beim Hover, mit den Werten von `.card:hover`; der goldene Fokusring bleibt |
| `.card-icon` | Icon der Karte 56 px, rund, 18 px Abstand nach unten; ohne Icon ein `i.card-icon` mit dem Verlauf von `.wordmark i` |
| `.tabs > input` | ersetzt `.tabs input` mit denselben Werten; versteckt nur die Radios der Tabs, nicht die Felder in den Panels |
| `.tab-list` | `overflow-y: hidden`; sonst zeigt `overflow-x: auto` einen senkrechten Rollbalken, weil der Strich des aktiven Tabs 1 px übersteht |
| `.form .button` | `justify-self: start`; der Knopf im Formular bleibt so breit wie sein Text |
| `.section-heading + .tabs` | 32 px Abstand wie `.grid` |
| `.link-button` | zweite Aktion auf hellem Grund: ein `button`, der aussieht wie ein Link im Text |
| `.field-error textarea`, `.field-error select` | Fehler wie bei `.field-error input` |
| `.form .field input::file-selector-button` | Datei-Feld: Rahmen, Höhe, Fokus und Fehler wie das Textfeld; der Knopf darin in `--sans`, `--ink` auf `--cream`, ohne Rand |
| `.picture`, `.picture img` | `.picture` ohne `min-height`; darin ein `img` mit `width` und `height` aus `breite` und `hoehe` der `vorschau`; daraus folgt das Seitenverhältnis, ohne eigene Regel |
| `#tab-4` bis `#tab-6` | wie `#tab-1` bis `#tab-3` im Guide: der aktive Tab mit `--ink` und Strich in `--gold`, sein Panel sichtbar; das Dashboard hat höchstens 6 Tabs |

Ohne eigene Regel, ebenso festgelegt:

- Eine Seite mit Bausteinen `daneben` steht als `.grid.grid-2`: links das
  Formular, rechts was daneben steht, etwa die Vorschau.
- Eine Meldung über der Serverliste steht in einem `.grid`, für den
  Abstand.
- Auf der Startseite ist „Einstellen | Dashboard“ der Primary button und
  „Ansehen | Quelltext“ ein `.button.button-quiet`.
- Das Datei-Feld nimmt die Typen aus `typen`; Hilfe und Texte kommen vom
  Bot.
- Jeder Eintrag einer Liste ist eine Karte (`article.card`) mit den
  Feldern darin; ein `.form` in der Karte gibt ihnen den Abstand, ein
  `.kicker` ist ihr Kopf. Optionen, die nicht gehen, sind im Select
  gesperrt und sagen, warum. Stand 2026-10-12.
- Eine Aktion steht unter „Speichern“ als zweiter Knopf im Stil eines
  Links; es gibt je Seite nur einen Primary button.

## Bewegung

Abschnitte mit `.reveal` blenden einmal ein, wenn sie ins Bild kommen,
650 ms (`--calm`), wie im Guide unter „Motion“. `web/src/main.ts` setzt
dafür `.js` an `html` und `.is-visible` an den Abschnitt. Ohne Skript und
bei `prefers-reduced-motion: reduce` ist alles sofort sichtbar. Der Kopf
der Seite blendet nie ein, sonst käme der grösste Inhalt später.
