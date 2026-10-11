---
title: Updates mit Renovate
description: Was Renovate aktualisiert und wann, wie Hauptversionen freigegeben werden, wie eine PR von Renovate geprüft wird und wie man es einrichtet.
code:
  - .github/renovate.jsonc
---

# Updates mit Renovate

Renovate läuft als GitHub-App und öffnet einmal die Woche PRs für neue
Fassungen der Actions, des Images der CI und der npm-Pakete. Die
Konfiguration steht in `.github/renovate.jsonc`. Jede PR von Renovate
durchläuft dieselben Checks und dasselbe Review wie jede andere und wird
von Hand gemergt. Warum Renovate, steht in
[0013](../entscheidungen/0013-renovate.md).

## Was Renovate aktualisiert

| Was | Datei | Wie |
|---|---|---|
| Actions | `.github/workflows/*.yml` | Commit-SHA und Kommentar mit dem Tag, siehe [CI und Ablauf einer PR](ci.md), „Actions und Images“ |
| PostgreSQL der CI | `.github/workflows/backend.yml` | neuer Digest zum Tag `18` |
| Node der CI | `node-version` in `backend.yml` und `frontend.yml` | nur Hauptversionen, siehe unten |
| npm-Pakete | `bot/package.json`, `web/package.json`, ihre Lockfiles | liegt die neue Fassung im Bereich, etwa `^8.23.1`, ändert sich nur das Lockfile |
| Dev-Datenbank | `bot/compose.yaml` | nur Hauptversionen; Fixes bringt der Tag `18` von selbst |

## Wann

- Neue PRs öffnet Renovate nur montags vor 4 Uhr UTC
  (`schedule:weekly`).
- Eine npm-Fassung schlägt es erst vor, wenn sie 3 Tage alt ist
  (`security:minimumReleaseAgeNpm`).
- Liegt `main` weiter, rebased Renovate seine PR selbst
  (`rebaseWhen: behind-base-branch`). Sonst bliebe „Basis aktuell“ rot.

## Hauptversionen

Eine neue Hauptversion öffnet Renovate erst, wenn sie im Issue
„Dependency Dashboard“ angehakt ist. Dasselbe gilt für jede Fassung von
`@napi-rs/canvas`, siehe
[0009](../entscheidungen/0009-banner-mit-napi-rs-canvas.md), „Folgen“.

Vor dem Haken klärt der Orchestrator mit dem Maintainer, ob eine
Entscheidung betroffen ist, etwa Node 24 in
[0002](../entscheidungen/0002-typescript-mit-discord-js.md) oder
PostgreSQL 18 in [0007](../entscheidungen/0007-postgres-mit-pg.md). Dann
kommt zuerst eine neue Entscheidung, die sie ablöst.

## Eine PR von Renovate prüfen

Wie jede PR, Skill [`pr-reviewen`](../../skills/pr-reviewen/SKILL.md).
Dazu:

- Nennt eine Seite in `docs/` die alte Fassung, zieht der Orchestrator sie
  mit einem eigenen Commit auf dem Branch nach (`AGENTS.md`, Regel 5).
- Nach einem fremden Commit aktualisiert Renovate den Branch nicht mehr
  ([Renovate-Doku](https://docs.renovatebot.com/updating-rebasing/#no-rebasing-if-you-have-made-edits)).
  Liegt `main` danach weiter, wird von Hand rebased wie in
  [CI und Ablauf einer PR](ci.md), „Basis aktuell“.
- Bei `@napi-rs/canvas` die SBOM lesen und `NOTICE` und 0009 nachziehen.
  Die PR erinnert in ihrer Beschreibung daran.
- Titel, Commits und Beschreibung schreibt Renovate auf Englisch.

## Einrichten

Einmal, durch einen Admin, nachdem `.github/renovate.jsonc` auf `main`
liegt:

1. Die GitHub-App [Renovate](https://github.com/apps/renovate) für dieses
   Repository installieren.
2. Renovate liest die Konfiguration nur von `main`. Weil sie dort schon
   liegt, gilt das Repository als eingerichtet; eine PR „Configure
   Renovate“ kommt nicht
   ([Renovate-Doku](https://docs.renovatebot.com/getting-started/installing-onboarding/)).
3. Der erste Lauf legt das Issue „Dependency Dashboard“ an.

Die Konfiguration prüft lokal, mit Node 24:

```bash
npx --package renovate renovate-config-validator --strict
```
