---
title: Design der Oberfläche
description: Die Regeln, nach denen web/ aussieht; Tokens, Schrift, Breakpoints, welches Element des Design-Guides wofür steht, woher jede CSS-Regel kommt.
code:
  - web/site.css
  - web/index.html
  - web/src/main.ts
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
5. **Geht ohne Skript.** Das Skript macht es nur angenehmer.
6. **Von 320 px an** ohne seitliches Scrollen.
7. **Fokus sichtbar:** der goldene Ring bleibt. Links nur mit Symbol haben
   `aria-label`.
8. **Deutsch, mit du.** Überschriften enden mit Punkt, Labels sind
   Substantive.
9. **Bilder:** WebP oder PNG mit `width` und `height`, Pixel-Art nur in
   ganzen Vielfachen. Vom Logo liegen `web/favicon.ico` und
   `web/logo192.png` im Repo, beide in der neuen Fassung.

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
nutzt heute nur 760 px: Darunter haben Abschnitt und Hero 20 px Rand.

## Elemente

| Was in `web/` | Klasse | Element im Guide |
|---|---|---|
| Kopf der Seite | `.hero`, `.hero-inner`, `.hero-copy` | Hero oben auf dem Guide |
| Knopf zum Quelltext | `.button` mit `span` und `strong` | Actions, „Primary button“ |
| Abschnitte | `.section`, `.ground-cream`, `.section-heading`, `.lead` | Grundfarben im Wechsel, „Sections“ |
| Kleine Zeile über Überschriften | `.eyebrow`, `.eyebrow-dark` | Content, „Eyebrow“ |
| Liste der Befehle | `.table-wrap` mit `table`, Befehl in `code` | Content, „Table, keys and code“ |
| Fuss | `.footer` | Fuss des Guides |

## Herkunft der Regeln

Der Guide liegt in der Fassung vom Commit `0dd0695` des Website-Repos von
Terranova (Stand 2026-10-10), unter MIT, siehe [`LICENSE`](LICENSE).
Ändert sich der Guide dort, kommen `design.html` und `design.css` in einer
eigenen PR neu, mit dem neuen Commit hier.

`web/site.css` besteht aus Blöcken, die wörtlich aus `design.css` kommen:
Tokens und Grundregeln, Hero, Abschnitte, Eyebrow, Knopf, Tabelle, Fuss,
der Breakpoint 760 px und reduzierte Bewegung. Zwei Regeln kommen von der
Website selbst, weil der Guide sie nur beschreibt: `.hero-actions` und
`.js .reveal`. Eine neue Regel kommt ebenso wörtlich aus dem Guide.

## Bewegung

Abschnitte mit `.reveal` blenden einmal ein, wenn sie ins Bild kommen,
650 ms (`--calm`), wie im Guide unter „Motion“. `web/src/main.ts` setzt
dafür `.js` an `html` und `.is-visible` an den Abschnitt. Ohne Skript und
bei `prefers-reduced-motion: reduce` ist alles sofort sichtbar. Der Kopf
der Seite blendet nie ein, sonst käme der grösste Inhalt später.
