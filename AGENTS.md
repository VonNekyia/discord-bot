# AGENTS.md

Regeln für alle, die in diesem Repository arbeiten, Agenten wie Menschen.
Das Wissen des Projekts ist AI first aufgebaut: zuerst für Agenten
geschrieben, für Menschen auf GitHub lesbar.

## Wo das Wissen liegt

| Ort | Inhalt | Wann lesen |
|---|---|---|
| `AGENTS.md` | Regeln | immer, diese Datei |
| `docs/` | Wissen: wie Bot und Weboberfläche arbeiten, Entscheidungen, Messungen | vor jeder Änderung die betroffenen Seiten |
| `skills/` | Workflows, Schritt für Schritt | vor dem passenden Arbeitsschritt |

`README.md` ist das Aushängeschild für Menschen: was das Projekt ist,
Schnellstart, Stand. Ausführlich steht alles in `docs/`.

## Rollen

| Rolle | Aufgabe |
|---|---|
| Maintainer | der User: entscheidet, was umgesetzt wird |
| Orchestrator | ist der Reviewer: zerlegt Aufträge, gibt sie an Backend und Frontend weiter, prüft jede PR und merged |
| Backend-Developer | der Bot mit discord.js, `bot/` |
| Frontend-Developer | die Weboberfläche in TypeScript, `web/`; hält sich strikt an das Design |

Aufträge gehen vom Orchestrator an die Developer, Fragen und fertige PRs
zurück an ihn. Developer geben sich keine Aufträge gegenseitig.

Das Design kommt aus dem Design-Guide der Website, siehe
[Design der Oberfläche](docs/frontend/design.md). Der Frontend-Developer
baut jedes Element so, wie der Guide es zeigt, mit den Tokens des Guides.
Fehlt ein Element im Guide, fragt er den Orchestrator, statt eins zu
erfinden.

Die Schnittstelle zwischen Bot und Weboberfläche steht in
[`docs/schnittstelle/`](docs/schnittstelle/api.md). Wer sie ändern will,
ändert zuerst die Seite dort, in einer eigenen PR, und der Orchestrator
holt vorher das Einverständnis der anderen Seite ein.

## Skills

| Skill | Wann |
|---|---|
| [`doku-pflegen`](skills/doku-pflegen/SKILL.md) | jede Änderung an Verhalten, Befehlen, Rechten, Intents, gespeicherten Daten, Oberfläche oder CI; jedes Review |
| [`entscheidung-festhalten`](skills/entscheidung-festhalten/SKILL.md) | eine Richtung wird festgelegt, eine Alternative verworfen oder eine Entscheidung abgelöst |
| [`pr-reviewen`](skills/pr-reviewen/SKILL.md) | Orchestrator: einen Auftrag verteilen, eine PR prüfen und mergen |
| [`befehl-hinzufuegen`](skills/befehl-hinzufuegen/SKILL.md) | Backend: ein Slash-Befehl, seine Optionen, Rechte oder Intents kommen dazu oder ändern sich |
| [`design-umsetzen`](skills/design-umsetzen/SKILL.md) | Frontend: etwas Sichtbares in `web/` kommt dazu oder ändert sich; Review einer solchen PR |

Vor dem Arbeitsschritt die `SKILL.md` ganz lesen und ihr folgen.

## Regeln

### Doku nutzen

1. Vor einer Änderung die Seiten lesen, die den Code beschreiben:
   `git grep -l "<pfad>" docs/` findet sie über `code:` in der Frontmatter.
   Dazu die Seiten, auf die Kommentare im Code verweisen.
2. Entscheidungen in `docs/entscheidungen/` mit `status: gilt` gelten. Wer
   abweichen will, schreibt eine neue, die sie ablöst.
3. Verhalten von Discord wird belegt, nicht aus Erinnerung beschrieben: mit
   einem Link auf die Doku von Discord oder discord.js, oder mit einem Test
   gegen die gemockte API.
4. Widersprechen sich Doku und Code, gilt keins von beiden. Klären und im
   selben PR richtigstellen.

### Doku pflegen

5. Die Doku ändert sich im selben PR wie der Code. Ein PR ohne passende Doku
   ist nicht fertig.
6. Eine Tatsache steht an genau einer Stelle. Andere Stellen verweisen
   darauf, statt sie zu kopieren.
7. Regeln stehen hier, Wissen in `docs/`, Workflows in `skills/`.
8. Alte Entscheidungen bleiben stehen. Eine abgelöste Entscheidung bekommt
   `status: abgelöst durch NNNN`.

### Für Agenten schreiben

9. Eine Seite, ein Thema. Lieber drei kurze Seiten als eine lange.
10. Jede Seite beginnt mit Frontmatter (`title`, `description`, `code`) und
    einem Absatz, der allein reicht, um zu entscheiden, ob man weiterliest.
11. Fakten vor Prosa: Listen, Tabellen, Zahlen mit Einheit und Stand.
    Bezeichner, Pfade und Befehle in Backticks.
12. Code wird mit Pfad und Symbol genannt, nicht mit Zeilennummer.
13. Jede Seite steht mit einer Zeile in `docs/index.md`. Jeder Skill steht
    in der Tabelle oben.
14. Überschriften bleiben stabil. Wer eine umbenennt oder eine Seite
    verschiebt, zieht alle Verweise nach: `git grep "docs/<pfad>"`. Die CI
    prüft Verweise, Links und Pfade unter `code:` mit
    `bash .github/pruefe-doku.sh`.
15. Links sind relativ, zwischen Seiten wie auf Skills und Code. So gehen
    sie auf GitHub und im Checkout.

### Code-Kommentare

16. Ein Kommentar sagt knapp, was der Code tut und welche Invariante gilt.
17. Entscheidungen, verworfene Alternativen und Belege stehen in `docs/`.
    Der Kommentar verweist darauf:

    ```ts
    // Wartet nach einem 429 so lange, wie Discord es verlangt.
    // Siehe docs/bot/rate-limits.md, „Was der Bot bei 429 tut“.
    ```

18. Ein Satz Begründung bleibt, wo der Code ohne ihn falsch aussähe, etwa
    bei einer Reihenfolge, die nicht vertauscht werden darf.

### Secrets

19. Jedes Secret, ob Bot-Token, Client-Secret oder Schlüssel, ist ein
    GitHub-Secret des Repositorys (Settings, Secrets and variables,
    Actions) und lokal eine Zeile in `.env`. `.env` steht in `.gitignore`;
    `.env.example` nennt jeden Namen ohne Wert.
20. Ein Secret steht nie im Code, in der Doku, in einem Test, in einem Log,
    in einer Fehlermeldung, in einem Issue oder einer PR. Ist eins
    durchgesickert, wird es sofort im Developer Portal neu erzeugt; ein
    Commit, der es entfernt, reicht nicht.

### Öffentlich

21. Das Repository ist öffentlich. Nirgends stehen IDs von Servern,
    Kanälen, Rollen oder Nutzern, Namen von Nutzern, Hosts, IPs, Ports der
    Produktion oder Pfade vom eigenen Rechner. Beispiele nutzen erfundene
    Werte. Ausser Terranova steht kein Servername da.
22. Deutsch, kurze Sätze. Frontmatter-Schlüssel englisch, wie in Agent
    Skills.

### Entwurf

23. Bei jeder neuen Abhängigkeit und jedem neuen Feature gilt die Frage:
    Braucht der Bot oder die Oberfläche das wirklich, und geht es nicht mit
    dem, was schon da ist, mit Node oder dem Browser? Wenn nein, kommt es
    nicht dazu.
24. Der Bot fordert nur die Intents und Rechte an, die ein Befehl braucht.
    Jeder Intent und jedes Recht ist in `docs/` begründet.

### Fremde Arbeit

25. Sich von fremder Arbeit inspirieren lassen ist etwas anderes, als sie
    zu übernehmen. Wer eine Idee oder ein Verfahren selbst umsetzt,
    übernimmt keinen Code. Code Zeile für Zeile nachzuschreiben, auch in
    einer anderen Sprache, ist Übernehmen.
26. Woher eine Idee stammt, steht nirgends: nicht in der Doku, nicht im
    Code und nicht in Issues, PRs oder Kommentaren. Kein anderes Projekt,
    kein Repository und keine Person steht dort als Vorbild oder als
    Quelle einer Idee. Quellen für Ideen gehen mit dem Entwurf direkt an
    den Orchestrator.
    - Tatsachen über die Umgebung, in der Bot und Oberfläche laufen, etwa
      wie Discord, Node oder ein Browser sich verhält, dürfen mit ihrer
      Quelle stehen.
    - Allgemein bekannte Verfahren dürfen bei ihrem Namen heissen. Vorher
      wird geprüft, ob wir das Verfahren nutzen dürfen: kein gültiges
      Patent, keine Lizenz, die einen Hinweis verlangt.
27. Eine Lizenz schliesst keinen Vorschlag aus. Kann das Übernehmen
    fremden Codes ein Lizenzproblem sein, auch weil eine Lizenz einen
    Hinweis auf die Herkunft verlangt, wird der User direkt gefragt.
    Abhängigkeiten haben eine permissive Lizenz; die CI prüft das.

### Ablauf

28. Jede Änderung ist eine eigene PR gegen `main`. Niemand pusht oder
    merged direkt auf `main`; das Ruleset des Repositorys erzwingt es.
29. Eine PR enthält den neuesten Stand von `main`, bevor sie gemergt wird:
    `git fetch origin && git rebase origin/main`, dann
    `git push --force-with-lease`. Der Check „Basis aktuell“ wird sonst
    rot, siehe [CI und Ablauf einer PR](docs/entwicklung/ci.md), „Basis aktuell“.
    Eine PR, die auf einer anderen aufbaut, bleibt Entwurf, bis ihr
    Vorgänger gemergt ist.
30. Branches heissen nach dem Inhalt, nie `claude/…`. PR-Beschreibungen
    tragen keine Zeile „Generated with Claude Code“.

### Struktur

32. Jede Feature-Suite ist ein Modul: ein Ordner unter `bot/src/module/`
    und, mit Oberfläche, unter `web/src/module/`. Ein Modul importiert
    kein anderes. Nur `bot/src/discord/` spricht mit discord.js, nur
    `web/src/api/` mit dem Bot. Der Linter prüft die Grenzen, siehe
    [Struktur von Bot und Oberfläche](docs/entwicklung/struktur.md).

## Gliederung von `docs/`

| Pfad | Inhalt |
|---|---|
| `docs/index.md` | Wegweiser: jede Seite mit einer Zeile |
| `docs/benutzung/` | Einrichtung, Secrets, Betrieb, Befehle, Begrüssung, Sprachräume |
| `docs/bot/` | wie der Bot arbeitet: Intents, Rate-Limits, Wiederanlauf, Datenschutz, Datenbank, Cache |
| `docs/schnittstelle/` | der Vertrag zwischen Bot und Dashboard: Routen der API, Anmeldung, Sitzung, Rechte, Sprachräume |
| `docs/frontend/` | Design der Oberfläche, der Design-Guide (`design.html`, `design.css`, MIT), Auslieferung und Header |
| `docs/entwicklung/` | CI, Ablauf einer PR, Tests, Lint, Struktur |
| `docs/entscheidungen/` | `NNNN-titel.md`, eine Datei je Entscheidung |
