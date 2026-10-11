---
title: "0012: Actions und Images in der CI fest an Commit und Digest"
description: Warum jede Action mit vollem Commit-SHA und das Image der PostgreSQL mit Digest im Workflow steht und actions/checkout kein Token liegen lässt.
status: gilt
date: 2026-10-11
issues: []
code:
  - .github/workflows/backend.yml
  - .github/workflows/doku.yml
  - .github/workflows/frontend.yml
---

# 0012: Actions und Images in der CI fest an Commit und Digest

## Anlass

Eine Prüfung der CI auf Manipulation fand die Actions mit dem Tag `v4` und
die PostgreSQL mit dem Tag `18` in den Workflows. Ein Tag lässt sich auf
anderen Code umhängen. Der nächste Lauf führt ihn dann aus, ohne dass sich
im Repository etwas ändert und ohne dass ein Review es sieht. Laut GitHub
ist ein voller Commit-SHA der einzige Weg, eine Action unveränderlich zu
nutzen
([Secure use reference](https://docs.github.com/en/actions/reference/security/secure-use#using-third-party-actions)).

Dazu liess `actions/checkout` das Token des Laufs in `.git/config` liegen,
während danach `npm ci`, die Tests und Lighthouse liefen.

## Entscheidung

Jede Action steht mit ihrem vollen Commit-SHA im Workflow, ihr Tag als
Kommentar dahinter. Ein Service-Image steht mit Tag und Digest,
`postgres:18@sha256:…`; gezogen wird der Digest, der Tag zeigt, welcher
Linie es folgt. `actions/checkout` läuft mit
`persist-credentials: false`. Wie man SHA und Digest erneuert, steht in
[CI und Ablauf einer PR](../entwicklung/ci.md), „Actions und Images“.

## Verworfene Alternativen

- **Tags wie bisher.** Updates innerhalb der Hauptversion kämen von
  selbst. Ein umgehängter Tag fiele aber nirgends auf.
- **Ein Tag mit voller Fassung, etwa `v4.4.0` oder `18.6`.** Auch so ein
  Tag lässt sich umhängen.

## Folgen

- Updates und Sicherheitsfixes der Actions und von PostgreSQL in der CI
  kommen nicht mehr von selbst. Wer sie will, erneuert SHA oder Digest in
  einer eigenen PR.
- Ein Werkzeug, das SHAs und Digests erneuert, kommt nur mit eigener PR
  und Entscheidung dazu (`AGENTS.md`, Regel 23). Der Maintainer zieht
  Renovate Dependabot vor.
- Ein Schritt, der nach dem Checkout Git mit Anmeldung braucht, etwa ein
  Push, muss das Token selbst setzen. Heute braucht das keiner.
- Die Dev-Datenbank in `bot/compose.yaml` bleibt beim Tag `18`, damit sie
  lokal Fixes bekommt.
