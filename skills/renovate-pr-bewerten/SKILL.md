---
name: renovate-pr-bewerten
description: Der Orchestrator bewertet PRs von Renovate, die nicht von selbst gemergt werden, merged sie ohne Konflikt und macht aus jedem Konflikt ein Issue, das niemand übersieht. Nutzen vor jedem neuen Auftrag (AGENTS.md, Regel 31), bei einer PR mit Label ki-review, einer roten oder hängenden PR von Renovate und bei einem offenen Issue mit Label konflikt.
---

# Renovate-PR bewerten

Renovate merged Minor, Patch und Digests stabiler Pakete selbst, wenn alle
Checks grün sind. Alles andere trägt das Label `ki-review` und ist die
nächste Aufgabe des Orchestrators: Hauptversionen, Pakete mit 0.x und
`@napi-rs/canvas`. Was Renovate wann tut, steht in
[Updates mit Renovate](../../docs/entwicklung/renovate.md).

## 1. Nachsehen, was wartet

Vor jedem neuen Auftrag, in dieser Reihenfolge:

```bash
gh issue list --label konflikt --state open
gh pr list --label ki-review --state open
gh pr list --author app/renovate --state open --json number,title,labels,createdAt,statusCheckRollup
```

- Ein offenes Issue `konflikt` steht in der Antwort an den Maintainer
  ganz oben, bis er entschieden hat. Mehr ist dafür nicht zu tun; es
  wartet auf ihn.
- Jede PR mit `ki-review` wird bewertet, die älteste zuerst, Schritt 2.
- Eine PR mit `automerge`, deren Checks rot sind oder die seit mehr als
  7 Tagen offen ist, ist ein Konflikt: Ein Update ohne Hauptversion soll
  durchgehen. Weiter mit Schritt 4.

## 2. Bewerten

Für jede PR: den Diff (`gh pr diff <nr>`) und die Release Notes lesen,
die Renovate in die Beschreibung schreibt. Dann jede Zeile prüfen:

| # | Prüfung | Wie | Konflikt, wenn |
|---|---|---|---|
| 1 | Checks | `gh pr checks <nr>` | einer rot ist |
| 2 | Breaking Changes | jeden Punkt der Release Notes zwischen alter und neuer Fassung mit `git grep` gegen `bot/src/` und `web/src/` halten | ein Punkt Code trifft, den wir nutzen, auch wenn die Tests grün sind |
| 3 | Entscheidungen | `git grep -l "<paket>" docs/entscheidungen/`, nur `status: gilt` | die neue Fassung einer widerspricht, etwa Node 24 in 0002 oder PostgreSQL 18 in 0007 |
| 4 | Lockfile | Befehl unten | ein Paket ein Install-Skript hat oder nicht von `registry.npmjs.org` kommt |
| 5 | Lizenz | Schritt „Lizenzen“ in „Backend“ und „Frontend“; neue Pakete aus Prüfung 4 | ein Paket seine Lizenz wechselt |
| 6 | Laufzeit | `engines` des neuen Pakets | es eine andere Node-Fassung als 24 verlangt |
| 7 | Doku | `git grep -n "<paket>" docs/ README.md` | – (nennt eine Seite die alte Fassung, ein eigener Commit auf dem Branch, Regel 5) |
| 8 | `@napi-rs/canvas` | die SBOM lesen wie in [0009](../../docs/entscheidungen/0009-banner-mit-napi-rs-canvas.md) | ein Bestandteil eine Lizenz hat, die nicht in 0009 steht |

Prüfung 4, neue Pakete, Install-Skripte und fremde Quellen im Lockfile:

```bash
git fetch origin main <branch>
for d in bot web; do
  node -e '
    const fs = require("node:fs");
    const alt = JSON.parse(fs.readFileSync(process.argv[1])).packages;
    const neu = JSON.parse(fs.readFileSync(process.argv[2])).packages;
    for (const [pfad, p] of Object.entries(neu)) {
      if (!pfad) continue;
      if (!alt[pfad]) console.log("neu:", pfad, p.version, p.license);
      if (p.hasInstallScript) console.log("Install-Skript:", pfad);
      if (p.resolved && !p.resolved.startsWith("https://registry.npmjs.org/")) console.log("Quelle:", pfad, p.resolved);
    }' <(git show origin/main:$d/package-lock.json) <(git show origin/<branch>:$d/package-lock.json)
done
```

Ein Kommentar an der PR hält das Ergebnis fest, zuerst die Zeile mit dem
Urteil:

```markdown
**Bewertung:** kein Konflikt.

| # | Prüfung | Ergebnis |
|---|---|---|
| 1 | Checks | grün |
| 2 | Breaking Changes | `Client#fetchX` entfällt; nutzen wir nicht (`git grep` ohne Treffer) |
```

## 3. Ohne Konflikt: mergen

1. Nennt eine Seite die alte Fassung: eigener Commit auf dem Branch, dann
   Schritt 2 ab Prüfung 1 neu. Danach aktualisiert Renovate den Branch
   nicht mehr; ist `main` weiter, von Hand rebasen.
2. Mergen wie in [`pr-reviewen`](../pr-reviewen/SKILL.md), „Mergen“.

## 4. Mit Konflikt: groß machen

Ein Konflikt ist kein Befund unter vielen. Er hält das Update an, bis der
Maintainer entscheidet, und er darf nicht untergehen.

1. **PR anhalten.**

   ```bash
   gh pr ready <nr> --undo
   gh pr edit <nr> --add-label konflikt
   ```

2. **Issue anlegen**, dem Maintainer zugewiesen:

   ```bash
   gh issue create --label konflikt \
     --assignee "$(gh repo view --json owner --jq .owner.login)" \
     --title "Konflikt: <paket> <alt> → <neu>" --body-file <datei>
   ```

   Inhalt, in dieser Reihenfolge:
   - was blockiert ist: die PR mit Nummer;
   - der Konflikt in einem Satz;
   - die Belege: Zeile aus den Release Notes, Datei und Symbol bei uns,
     Entscheidung mit Abschnitt, Log des roten Checks;
   - die Optionen, je mit Aufwand und Folgen;
   - eine Empfehlung.

3. **Kommentar an der PR:** erste Zeile `⛔ Konflikt, siehe #<issue>`,
   darunter die Tabelle aus Schritt 2.
4. **Dem Maintainer sagen:** Der Konflikt steht in der Antwort ganz oben,
   mit Link auf das Issue. Bis er entschieden hat, steht er in jeder
   Antwort zuerst (Regel 31).
5. **Nichts drumherum bauen.** Kein Merge, kein Workaround im Code, kein
   Festhalten der alten Fassung, kein Schließen der PR, bevor der
   Maintainer entschieden hat.

Nach seiner Entscheidung:

- **Annehmen, mit Anpassung:** Auftrag an Backend oder Frontend wie in
  [`pr-reviewen`](../pr-reviewen/SKILL.md), „Auftrag verteilen“. Berührt
  sie eine Entscheidung, zuerst
  [`entscheidung-festhalten`](../entscheidung-festhalten/SKILL.md).
- **Ablehnen:** PR und Issue mit seiner Begründung schließen.
- Das Issue schließt erst, wenn die PR gemergt oder geschlossen ist.

## Prüfliste

- [ ] Offene Konflikte stehen in der Antwort zuerst.
- [ ] Jede PR mit `ki-review` hat einen Kommentar mit Bewertung.
- [ ] Rote oder hängende PRs mit `automerge` sind als Konflikt behandelt.
- [ ] Konflikt: Entwurf, Label, Issue mit Belegen, Optionen und
      Empfehlung, Kommentar an der PR, Maintainer informiert.
- [ ] Ohne Konflikt: Doku nachgezogen, gemergt nach `pr-reviewen`.
