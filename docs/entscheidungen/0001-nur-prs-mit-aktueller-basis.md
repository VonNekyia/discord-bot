---
title: "0001: Nur PRs mit aktueller Basis auf main"
description: Warum main nur über PRs wächst, jede PR vor dem Merge den neuesten Stand von main enthalten muss und niemand eine Ausnahme hat.
status: gilt
date: 2026-10-10
issues: []
code:
  - .github/workflows/basis.yml
---

# 0001: Nur PRs mit aktueller Basis auf main

## Anlass

Orchestrator, Backend- und Frontend-Developer arbeiten gleichzeitig und
über ein Konto. Ohne Regel kann jeder direkt auf `main` pushen, und eine
PR kann über einen veralteten Stand gemergt werden. Dann laufen die Checks
gegen Code, der so nie auf `main` liegt.

## Entscheidung

Ein Ruleset auf dem Standardzweig verlangt eine PR, verbietet Löschen und
Force-Push und verlangt den Check „Basis aktuell“ im Modus strict. Es gibt
keine Ausnahme, auch nicht für Admins. Vor dem Merge wird die PR auf
`main` rebased. Wie das geht, steht in
[CI und Ablauf einer PR](../entwicklung/ci.md), „Basis aktuell“.

## Verworfene Alternativen

- **Ausnahme für Admins.** Das Konto, über das alle Rollen arbeiten, ist
  Admin. Mit der Ausnahme gälte die Regel für niemanden.
- **Pflicht-Freigabe durch einen Reviewer.** GitHub zählt keine Freigabe
  vom Autor der PR. Bei einem Konto sperrte das jede PR. Das Review macht
  der Orchestrator, Skill `pr-reviewen`.
- **Nur Squash oder nur Rebase beim Merge.** Löst das Problem nicht: Auch
  ein Squash über einen veralteten Stand kann `main` brechen. Der Check
  auf den neuesten Stand tut es.

## Folgen

- Nach jedem Merge muss jede offene PR rebased werden, bevor sie gemergt
  werden kann.
- Ein Notfall-Fix geht auch als PR, mit grünen Checks.
- Ein neuer Pflicht-Check kommt erst ins Ruleset, wenn er einmal gelaufen
  ist.
