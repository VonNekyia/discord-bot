---
title: "0013: Updates mit Renovate"
description: Warum Renovate die Actions, das Image der CI und die npm-Pakete aktuell hält, kleine Updates selbst merged und der Orchestrator alles andere bewertet, statt Dependabot, Updates von Hand oder Automerge für alles.
status: gilt
date: 2026-10-11
issues: []
code:
  - .github/renovate.jsonc
  - skills/renovate-pr-bewerten/SKILL.md
---

# 0013: Updates mit Renovate

Löst aus [0012](0012-actions-und-images-fest.md) die Folge ab, dass
Updates der Actions und des Images nur von Hand kommen.

## Anlass

Seit 0012 stehen die Actions und das Image der CI fest an Commit und
Digest. Fixes kommen so nicht mehr von selbst. Bei den npm-Paketen kommen
sie nur, wenn jemand nachsieht. Der Maintainer will ein Werkzeug dafür und
zieht Renovate Dependabot vor. Kleine Updates sollen von selbst gemergt
werden. Hauptversionen sollen die Agenten als nächste Aufgabe bewerten,
und ein Konflikt darf nicht untergehen.

## Entscheidung

Renovate läuft als GitHub-App mit der Konfiguration in
`.github/renovate.jsonc`:

- `config:recommended` als Grundlage.
- `helpers:pinGitHubActionDigests`: Eine neue Action kommt mit SHA dazu,
  bestehende SHAs erneuert Renovate samt Kommentar.
- `security:minimumReleaseAgeNpm`: eine npm-Fassung erst nach 3 Tagen.
- `schedule:weekly`: neue PRs nur montags früh.
- `rebaseWhen: behind-base-branch`, wegen „Basis aktuell“.
- Minor, Patch, Digest und Pin merged Renovate selbst, wenn alle Checks
  grün sind; nicht bei Paketen mit 0.x und nicht bei `@napi-rs/canvas`.
- Alles andere bekommt das Label `ki-review`. Der Orchestrator bewertet
  es vor jedem neuen Auftrag mit dem Skill `renovate-pr-bewerten` und
  merged es, oder er macht aus einem Konflikt ein Issue `konflikt` für den
  Maintainer und hält die PR an (`AGENTS.md`, Regel 31).

Wie man damit arbeitet, steht in
[Updates mit Renovate](../entwicklung/renovate.md).

## Verworfene Alternativen

- **Dependabot.** Der Maintainer zieht Renovate vor.
- **Updates von Hand.** Fixes kämen nur, wenn jemand nachsieht.
- **Kein Automerge.** Jede kleine Fassung bräuchte ein Review. Build,
  Tests, Lücken und Lizenzen prüfen die Checks ohnehin.
- **Automerge auch für Hauptversionen.** Eine Hauptversion darf
  Schnittstellen brechen, die kein Test abdeckt, und sie kann einer
  Entscheidung widersprechen, etwa Node 24 in 0002.
- **Automerge auch für 0.x.** Unter 1.0 darf laut SemVer jede Fassung
  brechen ([SemVer 2.0.0](https://semver.org/), Punkt 4).
- **Hauptversionen erst nach Freigabe im Dependency Dashboard.** Dann
  läge jede Hauptversion, bis jemand nachsieht. Der Maintainer will sie
  von den Agenten bewertet.
- **`config:best-practices` ganz.** `docker:pinDigests` pinnte auch die
  Dev-Datenbank in `bot/compose.yaml`, die laut 0012 beim Tag bleibt.
  `:pinDevDependencies` schriebe jede Dev-Abhängigkeit auf eine feste
  Fassung um; das brauchen wir nicht.
- **Titel auf Deutsch.** Dafür müsste man `commitMessageAction`,
  `commitMessageTopic` und `commitMessageExtra` umschreiben; Renovate
  nennt das „nur für Fortgeschrittene“. Titel und Beschreibung bleiben
  englisch.

## Folgen

- Kleine Updates landen ohne Review auf `main`. Ein manipuliertes Paket
  ginge durch, wenn es 3 Tage unentdeckt bleibt und alle Checks besteht.
- Der Orchestrator merged nicht mehr jede PR selbst (`AGENTS.md`,
  „Rollen“), und vor jedem neuen Auftrag sieht er nach Wartendem
  (Regel 31).
- Ein Admin installiert die App und legt die vier Labels an. Die App
  bekommt Schreibrechte auf das Repository, auch auf
  `.github/workflows/`.
- Das Ruleset gilt auch für Renovate: Es pusht nur Branches `renovate/…`
  und kommt nur per PR mit grünen Checks auf `main`.
- Das Issue „Dependency Dashboard“ bleibt dauerhaft offen.
- Renovate selbst steht unter AGPL-3.0. Es läuft als App bei Mend und
  kommt nicht ins Repository; die Lizenzprüfung (Regel 27) betrifft es
  nicht.
