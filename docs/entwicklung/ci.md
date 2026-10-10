---
title: CI und Ablauf einer PR
description: Welche Checks bei jeder PR laufen, welche das Ruleset von main verlangt und wie eine PR auf den neuesten Stand kommt.
code:
  - .github/workflows/basis.yml
  - .github/workflows/doku.yml
  - .github/pruefe-doku.sh
  - .github/workflows/backend.yml
  - .github/pruefe-lizenzen.mjs
---

# CI und Ablauf einer PR

Jede Änderung kommt als PR auf `main`. Das Ruleset „main: nur PRs mit
aktueller Basis“ lässt nichts anderes zu, auch nicht für Admins. Gemergt
wird nur, wenn alle Checks grün sind und die PR den neuesten Stand von
`main` enthält. Die Workflows haben keinen Pfadfilter, damit jeder Check
bei jeder PR läuft.

## Ruleset von `main`

Stand 2026-10-10, Ruleset 24844508:

| Regel | Wirkung |
|---|---|
| Pull Request | kein direkter Push auf `main`; 0 Freigaben, weil alle Rollen über ein Konto arbeiten |
| Status-Checks, strict | „Basis aktuell“ muss grün sein, und die PR muss den neuesten Stand von `main` enthalten |
| kein Löschen, kein Force-Push | `main` bleibt, wie es ist |
| Ausnahmen | keine, auch nicht für Admins |

Neue Checks kommen ins Ruleset, sobald sie einmal auf einer PR gelaufen
sind. Ein Check im Ruleset, der nie läuft, sperrt jede PR.

## Basis aktuell

`.github/workflows/basis.yml`, Job „Basis aktuell“. Rot, wenn die Basis
der PR nicht `main` ist oder `main` Commits hat, die der PR fehlen. Läuft
auch, wenn jemand die Basis umstellt (`edited`).

Auf den neuesten Stand bringen:

```bash
git fetch origin
git rebase origin/main
git push --force-with-lease
```

Oder auf GitHub „Update branch“ mit „Update with rebase“.

## Doku

`.github/workflows/doku.yml`, Job „Doku“. Führt
`bash .github/pruefe-doku.sh` aus. Das Skript prüft:

- Verweise im Code, `Siehe docs/<seite>.md, „<Überschrift>“`, in jeder
  Datei ausser Markdown: Seite und Überschrift gibt es;
- relative Links in `docs/`, `skills/`, `README.md` und `AGENTS.md` zeigen
  auf eine Datei, mit `, „<Überschrift>“` dahinter auch auf die
  Überschrift;
- jede Seite in `docs/` hat Frontmatter mit `title`, `description` und
  `code:`, jeder Pfad unter `code:` existiert;
- jede Seite in `docs/` steht in `docs/index.md`.

Danach verbiegt die Probe je einen Fall und verlangt genau sechs
Meldungen. So fällt auf, wenn die Prüfung nichts mehr findet.

Unter Git Bash (MSYS) findet Bash eine Zeichenklasse mit „“ wie `[^“]`
unter `LC_ALL=C.UTF-8` nicht. Die Überschrift hinter einem Link bliebe so
lokal leer und ungeprüft. Die Prüfung nimmt darum `(.*)` und kürzt am
ersten `“`. Beim Start prüft sie an zwei Links auf einer Zeile selbst, dass
sie Überschriften findet, und bricht sonst mit einer Meldung ab.

## Backend

`.github/workflows/backend.yml`, Job „Backend“, in `bot/` mit Node 24:

| Schritt | Befehl | rot, wenn |
|---|---|---|
| Build und Tests | `npm test` | `tsc` einen Fehler findet oder ein Test fällt, siehe [Tests](tests.md) |
| Sicherheitslücken | `npm audit --omit=dev --audit-level=high` | eine Laufzeit-Abhängigkeit eine Lücke ab „high“ hat |
| Lizenzen | `node ../.github/pruefe-lizenzen.mjs package-lock.json` | siehe unten |

## Lizenzen

`.github/pruefe-lizenzen.mjs` liest ein `package-lock.json` und prüft
jedes Paket ohne `"dev": true`, also alles, was mit ausgeht. Erlaubt sind
`0BSD`, `Apache-2.0`, `BlueOak-1.0.0`, `BSD-2-Clause`, `BSD-3-Clause`,
`CC0-1.0`, `ISC`, `MIT`, `MIT-0` und `Unlicense`. Bei `OR` reicht eine
erlaubte Wahl, bei `AND` müssen alle erlaubt sein. Fehlt die Lizenz, ist
das ein Fehler. Eine neue Lizenz kommt nur mit Frage an den User dazu
(`AGENTS.md`, Regel 27).

Danach prüft eine Probe, dass ein Paket unter `GPL-3.0` gemeldet wird und
eins unter `(MIT OR GPL-3.0)` nicht.
