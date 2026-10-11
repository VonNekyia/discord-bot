---
title: Updates mit Renovate
description: Was Renovate aktualisiert und wann, was es selbst merged, was der Orchestrator bewertet, welche Labels gelten und wie man es einrichtet.
code:
  - .github/renovate.jsonc
  - skills/renovate-pr-bewerten/SKILL.md
---

# Updates mit Renovate

Renovate läuft als GitHub-App und öffnet einmal die Woche PRs für neue
Fassungen der Actions, des Images der CI und der npm-Pakete. Kleine
Updates merged es selbst, wenn alle Checks grün sind. Alles andere
bewertet der Orchestrator als nächste Aufgabe; einen Konflikt macht er
zu einem Issue für den Maintainer. Die Konfiguration steht in
`.github/renovate.jsonc`, warum es so ist, in
[0013](../entscheidungen/0013-renovate.md).

## Was Renovate aktualisiert

| Was | Datei | Wie |
|---|---|---|
| Actions | `.github/workflows/*.yml` | Commit-SHA und Kommentar mit dem Tag, siehe [CI und Ablauf einer PR](ci.md), „Actions und Images“ |
| PostgreSQL der CI | `.github/workflows/backend.yml` | neuer Digest zum Tag `18` |
| Node der CI | `node-version` in `backend.yml` und `frontend.yml` | nur Hauptversionen |
| npm-Pakete | `bot/package.json`, `web/package.json`, ihre Lockfiles | liegt die neue Fassung im Bereich, etwa `^8.23.1`, ändert sich nur das Lockfile |
| Dev-Datenbank | `bot/compose.yaml` | nur Hauptversionen; Fixes bringt der Tag `18` von selbst |

## Wann

- Neue PRs öffnet Renovate nur montags vor 4 Uhr UTC
  (`schedule:weekly`).
- Eine npm-Fassung schlägt es erst vor, wenn sie 3 Tage alt ist
  (`security:minimumReleaseAgeNpm`).
- Liegt `main` weiter, rebased Renovate seine PR selbst
  (`rebaseWhen: behind-base-branch`). Sonst bliebe „Basis aktuell“ rot.

## Automerge

Minor, Patch, Digest und Pin merged Renovate selbst, sobald alle vier
Checks grün sind und die PR den neuesten Stand von `main` enthält. Solche
PRs tragen das Label `automerge`. Ausgenommen sind:

- Pakete mit einer Fassung 0.x: Dort darf schon ein Minor brechen.
- `@napi-rs/canvas`: Jede Fassung braucht einen Blick in die SBOM, siehe
  [0009](../entscheidungen/0009-banner-mit-napi-rs-canvas.md), „Folgen“.

Ist „Allow auto-merge“ in den Einstellungen des Repositorys an, nutzt
Renovate die Funktion von GitHub, sonst merged es selbst
([`platformAutomerge`](https://docs.renovatebot.com/configuration-options/#platformautomerge)).
Das Ruleset gilt in beiden Fällen: ohne grüne Checks kein Merge.

Bleibt eine PR mit `automerge` rot oder länger als 7 Tage offen, ist das
ein Konflikt wie unten.

## Bewertung

Alles, was nicht unter Automerge fällt, trägt das Label `ki-review`:
Hauptversionen, Pakete mit 0.x und `@napi-rs/canvas`. Solche PRs sind die
nächste Aufgabe des Orchestrators (`AGENTS.md`, Regel 31). Er bewertet
sie mit dem Skill
[`renovate-pr-bewerten`](../../skills/renovate-pr-bewerten/SKILL.md):
Checks, Breaking Changes gegen unseren Code, Entscheidungen, Lockfile,
Lizenzen, Laufzeit, Doku.

- **Kein Konflikt:** Ein Kommentar hält die Bewertung fest, dann merged
  er.
- **Konflikt:** Die PR wird Entwurf und bekommt das Label `konflikt`. Ein
  Issue mit demselben Label, dem Maintainer zugewiesen, nennt Belege,
  Optionen und eine Empfehlung. Bis der Maintainer entschieden hat, steht
  der Konflikt in jeder Antwort an ihn zuerst, und nichts wird gemergt.

## Labels

| Label | An | Bedeutung |
|---|---|---|
| `abhaengigkeit` | jeder PR von Renovate | ein Update |
| `automerge` | PR | Renovate merged selbst, wenn alles grün ist |
| `ki-review` | PR | der Orchestrator bewertet sie als nächste Aufgabe |
| `konflikt` | PR und Issue | angehalten, bis der Maintainer entscheidet |

## Commits auf einem Branch von Renovate

Nach einem fremden Commit aktualisiert Renovate den Branch nicht mehr
([Renovate-Doku](https://docs.renovatebot.com/updating-rebasing/#no-rebasing-if-you-have-made-edits)).
Liegt `main` danach weiter, wird von Hand rebased wie in
[CI und Ablauf einer PR](ci.md), „Basis aktuell“. Titel, Commits und
Beschreibung schreibt Renovate auf Englisch.

## Einrichten

Einmal, durch einen Admin, nachdem `.github/renovate.jsonc` auf `main`
liegt:

1. Die Labels anlegen:

   ```bash
   gh label create abhaengigkeit --force --color 0366D6 --description "Update von Renovate"
   gh label create automerge --force --color 0E8A16 --description "Renovate merged selbst, wenn alles grün ist"
   gh label create ki-review --force --color FBCA04 --description "Der Orchestrator bewertet als nächste Aufgabe"
   gh label create konflikt --force --color B60205 --description "Angehalten, bis der Maintainer entscheidet"
   ```

2. Die GitHub-App [Renovate](https://github.com/apps/renovate) für dieses
   Repository installieren. Weil die Konfiguration schon auf `main` liegt,
   gilt das Repository als eingerichtet; eine PR „Configure Renovate“
   kommt nicht
   ([Renovate-Doku](https://docs.renovatebot.com/getting-started/installing-onboarding/)).
3. Wahlweise unter Settings, General „Allow auto-merge“ einschalten.
4. Der erste Lauf legt das Issue „Dependency Dashboard“ an.

Die Konfiguration prüft lokal, mit Node 24:

```bash
npx --package renovate renovate-config-validator --strict
```
