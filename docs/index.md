---
title: Wegweiser
description: Jede Seite der Doku mit einer Zeile, nach Themen geordnet, dazu die Entscheidungen.
code: []
---

# Wegweiser

Das Wissen des Projekts: wie Bot und Weboberfläche arbeiten, wie eine
Änderung auf `main` kommt, was entschieden ist. Die Regeln stehen in
[`AGENTS.md`](../AGENTS.md), die Workflows in [`skills/`](../skills/). Zu
einer Datei findet `git grep -l "<pfad>" docs/` ihre Seiten.

## Entwicklung

- [CI und Ablauf einer PR](entwicklung/ci.md): Ruleset von `main`, „Basis aktuell“, Rebase, die Prüfung der Doku.

## Entscheidungen

- [0001: Nur PRs mit aktueller Basis auf main](entscheidungen/0001-nur-prs-mit-aktueller-basis.md): Ruleset ohne Ausnahme, Check im Modus strict, keine Pflicht-Freigabe.
