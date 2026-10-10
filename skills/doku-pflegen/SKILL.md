---
name: doku-pflegen
description: Hält docs/ und die Code-Kommentare mit einer Änderung im Einklang. Nutzen bei jeder PR, die Verhalten, Befehle, Rechte, Intents, gespeicherte Daten, die Oberfläche oder die CI ändert, und im Review einer solchen PR.
---

# Doku pflegen

## Ablauf

1. **Betroffene Seiten finden.** Für jede geänderte Datei die Seiten, die
   sie in `code:` nennen: `git grep -l "<pfad>" docs/`.
   Dazu die Seiten, auf die Kommentare im geänderten Code verweisen:
   `git grep -h "Siehe docs/" -- <datei>`.
2. **Wissen nachziehen.** Auf jeder betroffenen Seite prüfen: Stimmen der
   erste Absatz, Befehle, Rechte, Intents, Zahlen, Beispiele und die Liste
   `code:` noch?
3. **Neues Thema?** Neue Seite nach der Vorlage unten, dazu eine Zeile in
   `docs/index.md`.
4. **Entscheidung getroffen?** Skill `entscheidung-festhalten`.
5. **Verhalten von Discord behauptet?** Mit Link auf die Doku von Discord
   oder discord.js belegen, oder mit einem Test gegen die gemockte API.
6. **Kommentare.** Erzählt ein Kommentar ein Warum, den Text auf die Seite
   ziehen und durch einen Verweis ersetzen. Ist eine Seite verschoben oder
   eine Überschrift umbenannt: `git grep "docs/<alter-pfad>"` und alle
   Treffer nachziehen.
7. **README** nur ändern, wenn sich Schnellstart, Stand oder das Bild des
   Projekts ändern.
8. **Verweise prüfen:** `bash .github/pruefe-doku.sh`, lokal wie in der
   CI; eine neue Seite erst nach `git add`.
9. **Prüfliste** unten abhaken.

## Vorlage für eine Seite

Pfade in `code:` relativ zum Wurzelverzeichnis.

```markdown
---
title: Rate-Limits
description: Was der Bot tut, wenn Discord mit 429 antwortet, und wie oft er Befehle registriert.
code:
  - bot/src/index.ts
---

# Rate-Limits

Ein Absatz: was gilt, wo es im Code steht, was es kostet.

## …
```

## Prüfliste

Für die eigene PR und im Review:

- [ ] Für jede geänderte Datei die Seiten mit ihrem Pfad gelesen und
      nachgezogen.
- [ ] Neue Seiten stehen in `docs/index.md`.
- [ ] Neue Entscheidungen haben ihre Datei.
- [ ] Kommentare verweisen, statt Entscheidungen zu erzählen. Jeder Verweis
      zeigt auf eine bestehende Seite und Überschrift.
- [ ] Keine Secrets, keine IDs, keine Interna, siehe `AGENTS.md`, Regeln
      20 und 21.
- [ ] `bash .github/pruefe-doku.sh` meldet nichts.
