---
name: design-umsetzen
description: Baut oder ändert ein Element der Oberfläche strikt nach dem Design-Guide. Nutzen, wenn der Frontend-Developer an web/ etwas sichtbar ändert, und im Review einer solchen PR.
---

# Design umsetzen

## Ablauf

1. **Seiten lesen:** [Design der Oberfläche](../../docs/frontend/design.md)
   ganz, [Auslieferung](../../docs/frontend/auslieferung.md) für die CSP.
2. **Element im Guide finden.** `docs/frontend/design.html` im Browser
   öffnen, das Element suchen. Gibt es keins, das passt: aufhören und den
   Orchestrator fragen.
3. **Regeln übernehmen.** Die Regeln des Elements wörtlich aus
   `docs/frontend/design.css` nach `web/site.css` kopieren, mit den
   Breakpoints, die zu ihm gehören. Nichts umbenennen, keine Werte ändern.
4. **HTML** mit denselben Klassen und derselben Struktur wie im Guide.
   Text auf Deutsch, mit du; Überschriften enden mit Punkt.
5. **Verhalten** nur in `web/src/`, nur als Zusatz: ohne Skript muss alles
   gehen. Kein Skript und kein Stil im HTML.
6. **Ansehen** mit `npm run build` und `npm run serve` in `web/`: bei
   360 px, 760 px, 1280 px und 1920 px Breite, mit Tastatur (Fokus
   sichtbar) und mit `prefers-reduced-motion: reduce`.
7. **Prüfen:** `npm run lighthouse` in `web/`, während der Server läuft.
8. **Doku:** die Tabelle „Elemente“ auf der Seite Design nachziehen;
   Skill `doku-pflegen`.

## Prüfliste

- [ ] Element aus dem Guide, Regeln wörtlich, nur Tokens.
- [ ] Keine Inline-Stile, kein Inline-Skript, nichts von anderen Hosts.
- [ ] Geht ohne Skript; bei reduzierter Bewegung bewegt sich nichts.
- [ ] Kein seitliches Scrollen ab 320 px; Fokus sichtbar.
- [ ] Lighthouse und Header-Prüfung grün.
- [ ] Tabelle „Elemente“ nachgezogen.
