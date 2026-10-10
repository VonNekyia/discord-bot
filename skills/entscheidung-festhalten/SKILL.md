---
name: entscheidung-festhalten
description: Hält eine Entscheidung als eigene Datei in docs/entscheidungen/ fest. Nutzen, wenn eine PR eine Richtung festlegt, eine Alternative oder Abhängigkeit verwirft, einen Intent oder ein Recht einführt oder eine frühere Entscheidung ablöst.
---

# Entscheidung festhalten

## Ablauf

1. **Gibt es schon eine?** `git grep -il "<stichwort>" docs/entscheidungen/`.
   Ändert die neue eine alte, wird die alte abgelöst, nicht umgeschrieben
   (Schritt 5).
2. **Nummer:** die nächste freie, vierstellig. `ls docs/entscheidungen/`
   zeigt die letzte; offene PRs mit `gh pr list` auch ansehen.
3. **Datei** `docs/entscheidungen/NNNN-kurzer-titel.md` nach der Vorlage
   unten.
4. **Inhalt:**
   - Anlass: welches Problem, welches Issue.
   - Entscheidung: was gilt, in einem Absatz.
   - Verworfene Alternativen: jede mit Grund, gemessen, wo es geht.
   - Folgen: was dadurch teurer, grösser, langsamer oder unmöglich wird.
5. **Ablösen:** In der alten Datei nur `status: abgelöst durch NNNN` setzen
   und unter dem Titel einen Satz mit Verweis auf die neue ergänzen. Der
   Rest bleibt, wie er war.
   Löst die neue nur einen Teil ab, bleibt `status: gilt`, und der Satz
   unter dem Titel nennt den abgelösten Teil.
6. **Verweisen:** Die Seiten in `docs/`, die das Thema beschreiben, und die
   Kommentare am Code verweisen auf die Entscheidung. Der Kommentar erzählt
   sie nicht nach.
7. **Eintragen:** eine Zeile in `docs/index.md`.

## Vorlage

```markdown
---
title: "0002: TypeScript mit discord.js"
description: Warum der Bot in TypeScript auf Node mit discord.js läuft.
status: gilt
date: 2026-10-10
issues: []
code:
  - bot/package.json
---

# 0002: TypeScript mit discord.js

## Anlass

## Entscheidung

## Verworfene Alternativen

## Folgen
```
