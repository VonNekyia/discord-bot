---
title: "0022: Beispiele im Vertrag statt gemeinsamer Typen"
description: Warum Bot und Oberfläche ihre Typen nicht teilen, sondern an Beispielen in docs/schnittstelle/beispiele/ gemessen werden, die der Bot erzeugt und die Prüfer der Oberfläche annehmen müssen; keine gemeinsame Quelle, kein Schema, kein Artefakt zwischen den Jobs.
status: gilt
date: 2026-10-21
issues: [54]
code:
  - docs/schnittstelle/api.md
  - bot/src/api/server.ts
  - bot/src/kern/baukasten.ts
  - web/src/api/klient.ts
---

# 0022: Beispiele im Vertrag statt gemeinsamer Typen

## Anlass

Issue #54. Die Typen der API stehen dreimal: im Vertrag unter
`docs/schnittstelle/`, im Bot und in den Prüfern von
`web/src/api/klient.ts`. Ändert sich ein Typ an einer Stelle, merkt das
heute nur das Review. Der Maintainer will, dass die CI es merkt.

## Entscheidung

Zum Vertrag gehören Beispiele: echte Antworten des Bots als JSON in
`docs/schnittstelle/beispiele/`. Wie sie aussehen, steht in
[API des Dashboards](../schnittstelle/api.md), „Beispiele“. Zwei Tests
halten Bot und Oberfläche an ihnen fest:

| Seite | Test | fällt, wenn |
|---|---|---|
| Bot | erzeugt jede Antwort mit Fälschungen, fester Uhr und einem Probe-Modul und vergleicht sie genau mit den Dateien | eine Antwort anders aussieht als ihr Beispiel, oder eine Route mit JSON-Body kein Beispiel hat |
| Oberfläche | gibt jedes Beispiel dem Prüfer seines Typs | ein Prüfer ein Beispiel ablehnt, ein Baustein dabei zu `unbekannt` wird, oder ein Typ, den die Oberfläche prüft, kein Beispiel hat |

- Der Bot schreibt die Dateien selbst neu, mit `BEISPIELE_SCHREIBEN=1`
  beim Test. Von Hand ändert sie niemand.
- Die Beispiele kommen aus festen Testdaten, nicht aus den Seiten der
  echten Module. Ein neuer Satz in einem Modul ändert sie also nicht, nur
  eine neue Form.
- Das Probe-Modul nutzt jede Art von Baustein und jedes optionale Feld
  mindestens einmal, dazu einen `fund`.
- Ein Bruch geht in zwei Schritten: Zuerst nimmt die Oberfläche die alte
  und die neue Form an, danach ändert der Bot seine Antwort und die
  Beispiele. So bleibt `main` in beiden Jobs grün, und Backend und
  Frontend behalten je ihre PR.
- Die Oberfläche bekommt `npm test` mit `node:test`, ohne neue
  Abhängigkeit. Der Job „Frontend“ führt ihn aus. Er läuft bei jeder PR,
  also auch bei einer, die nur Beispiele ändert.

## Verworfene Alternativen

- **Gemeinsame Typen in einem Ordner, den `bot/` und `web/` einbinden.**
  - Beide Projekte haben je ein eigenes `rootDir`, keine Workspaces und
    Grenzen per Lint (Entscheidung
    [0015](0015-feature-module-und-schichten.md)).
  - Vor allem prüft ein gemeinsamer Typ nichts zur Laufzeit. Der Fehler,
    um den es geht, ist ein Prüfer im Browser, der eine echte Antwort
    ablehnt. Den fände der Compiler nie.
- **Typen und Prüfer aus einem Schema erzeugen**, etwa JSON Schema. Das
  braucht eine neue Abhängigkeit oder einen eigenen Generator (Regel 23).
  Entscheidung [0017](0017-dashboard-als-baukasten.md) hat einen
  Schema-Standard schon verworfen.
- **Die Antworten als Artefakt vom Job „Backend“ an den Job „Frontend“
  geben.** Das koppelt die Jobs. Lokal liesse sich die Oberfläche nicht
  ohne Bot prüfen, und im Review sähe niemand, wie sich eine Antwort
  ändert.
- **Die Seiten der echten Module als Beispiele.** Jede Änderung eines
  Satzes änderte dann die Beispiele.

## Folgen

- Ändert jemand eine Antwort im Bot, fällt sein Test, bis die Beispiele
  neu geschrieben sind. Nehmen die Prüfer der Oberfläche die neuen
  Beispiele nicht an, fällt danach ihr Test. So zeigt die CI, was das
  Review bisher allein sehen musste.
- Die Typen in den Markdown-Seiten des Vertrags bleiben von Hand
  geschrieben. Die Beispiele daneben sind aber geprüft. Wer den Vertrag
  ändert, schaut, ob sie noch dazu passen.
- Ein neues optionales Feld fängt der Test nur, wenn das Probe-Modul es
  nutzt. Wer ein Feld einführt, nimmt es dort auf.
- Die Beispiele zeigen nur erfundene Werte (Regel 21).
