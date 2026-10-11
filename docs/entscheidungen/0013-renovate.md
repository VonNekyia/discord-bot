---
title: "0013: Updates mit Renovate"
description: Warum Renovate die Actions, das Image der CI und die npm-Pakete aktuell hält, statt Dependabot oder Updates von Hand, und warum ohne Automerge.
status: gilt
date: 2026-10-11
issues: []
code:
  - .github/renovate.jsonc
---

# 0013: Updates mit Renovate

Löst aus [0012](0012-actions-und-images-fest.md) die Folge ab, dass
Updates der Actions und des Images nur von Hand kommen.

## Anlass

Seit 0012 stehen die Actions und das Image der CI fest an Commit und
Digest. Fixes kommen so nicht mehr von selbst. Bei den npm-Paketen kommen
sie nur, wenn jemand nachsieht. Der Maintainer will ein Werkzeug dafür und
zieht Renovate Dependabot vor.

## Entscheidung

Renovate läuft als GitHub-App mit der Konfiguration in
`.github/renovate.jsonc`:

- `config:recommended` als Grundlage.
- `helpers:pinGitHubActionDigests`: Eine neue Action kommt mit SHA dazu,
  bestehende SHAs erneuert Renovate samt Kommentar.
- `security:minimumReleaseAgeNpm`: eine npm-Fassung erst nach 3 Tagen.
- `schedule:weekly`: neue PRs nur montags früh.
- `rebaseWhen: behind-base-branch`, wegen „Basis aktuell“.
- Hauptversionen und jede Fassung von `@napi-rs/canvas` erst nach
  Freigabe im Dependency Dashboard.
- Kein Automerge.

Wie man damit arbeitet, steht in
[Updates mit Renovate](../entwicklung/renovate.md).

## Verworfene Alternativen

- **Dependabot.** Der Maintainer zieht Renovate vor.
- **Updates von Hand.** Fixes kämen nur, wenn jemand nachsieht.
- **Automerge.** Der Orchestrator prüft und merged jede PR (`AGENTS.md`,
  „Rollen“). Eine neue Fassung kann eine Seite in `docs/` veralten lassen,
  die im selben PR nachgezogen wird (Regel 5).
- **`config:best-practices` ganz.** `docker:pinDigests` pinnte auch die
  Dev-Datenbank in `bot/compose.yaml`, die laut 0012 beim Tag bleibt.
  `:pinDevDependencies` schriebe jede Dev-Abhängigkeit auf eine feste
  Fassung um; das brauchen wir nicht.
- **Titel auf Deutsch.** Dafür müsste man `commitMessageAction`,
  `commitMessageTopic` und `commitMessageExtra` umschreiben; Renovate
  nennt das „nur für Fortgeschrittene“. Titel und Beschreibung bleiben
  englisch.

## Folgen

- Ein Admin installiert die App. Sie bekommt Schreibrechte auf das
  Repository, auch auf `.github/workflows/`.
- Das Ruleset gilt auch für Renovate: Es pusht nur Branches `renovate/…`
  und kommt nur per PR mit grünen Checks auf `main`.
- Das Issue „Dependency Dashboard“ bleibt dauerhaft offen.
- Renovate selbst steht unter AGPL-3.0. Es läuft als App bei Mend und
  kommt nicht ins Repository; die Lizenzprüfung (Regel 27) betrifft es
  nicht.
