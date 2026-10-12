---
title: "0017: Das Dashboard als Baukasten"
description: Warum die Module des Bots ihre Seiten im Dashboard als Bausteine anmelden und die Oberfläche jede Art von Baustein allgemein baut; Texte und Regeln im Bot, Regeln über mehrere Felder nur im Bot; keine Formulare je Modul in web/, kein Schema-Standard, kein HTML vom Bot.
status: gilt
date: 2026-10-12
issues: [28]
code:
  - bot/src/kern/baukasten.ts
  - bot/src/api/server.ts
---

# 0017: Das Dashboard als Baukasten

## Anlass

Der Maintainer will das Dashboard als API-Baukasten: Was man sieht,
entscheidet das Backend damit, wie es die Bausteine anmeldet; das
Frontend stellt die Breite an Bausteinen bereit. Stand vorher:

- `web/` hatte je Feature ein eigenes Formular, mit Feldern, Texten und
  Regeln im HTML und im TypeScript der Oberfläche;
- `bot/src/api/server.ts` hatte je Feature eigene Routen und importierte
  dafür jedes Modul;
- jede Regel stand doppelt: im Bot und, zum Prüfen vor dem Senden, in
  `web/`; die längsten Werte der Platzhalter auch;
- ein neues Feature brauchte eine Änderung in Bot, API und Oberfläche.

## Entscheidung

Jedes Modul meldet seine Seiten als `Bereich` an, mit Bausteinen wie
`schalter`, `auswahl`, `text`, `zahl`, `bild`, `vorschau`, `aktion`,
`liste` und `hinweis`, siehe [Baukasten des Dashboards](../schnittstelle/baukasten.md).

- **Der Bot** liefert je Seite die Bausteine mit Werten, Optionen, Texten
  und den Sätzen zu seinen Codes. Er prüft alles beim Speichern.
- **Die API** hat allgemeine Routen unter `…/seiten` und reicht sie an
  den Bereich der Seite weiter. Sie importiert kein Modul mehr.
- **Die Oberfläche** baut jede Art von Baustein allgemein, nach dem
  Design-Guide. Sie prüft vor dem Senden nur, was ein Baustein selbst
  beschreibt; Regeln über mehrere Felder prüft nur der Bot.

Ein neues Modul braucht keinen Code in `web/`, solange es mit den
Bausteinen auskommt. Braucht es eine neue Art, kommt sie zuerst in den
Vertrag und dann in die Oberfläche, für alle Module.

## Verworfene Alternativen

- **Ein Formular je Modul in `web/`, wie vorher.** Jede Änderung an einem
  Feature trifft drei Stellen, und jede Regel steht doppelt.
- **Nur die Liste der Tabs vom Bot, die Formulare weiter in `web/`.** Das
  löst die doppelten Regeln nicht, und ein Modul braucht weiter
  Oberflächencode.
- **Ein Schema-Standard wie JSON Schema mit einem Formular-Paket.** Ein
  neues Paket im Browser und ein Bundler (`AGENTS.md`, Regel 23,
  Entscheidung [0004](0004-frontend-ohne-bundler.md)); die Elemente
  kämen nicht aus dem Design-Guide.
- **HTML vom Bot.** Die Oberfläche hielte sich nicht mehr selbst an den
  Design-Guide, und die CSP müsste fremdes Markup erlauben.
- **Regeln über mehrere Felder als Ausdrücke im Vertrag.** Eine kleine
  Sprache für Bedingungen wäre mehr Vertrag, als die zwei Fälle heute
  brauchen. Nur `braucht` an einem Schalter bleibt, weil es das Formular
  vor dem Speichern sperrt; alles andere meldet der Bot mit `400`.

## Folgen

- Die Routen der Begrüssung und der Sprachräume sind weg; dafür gibt es
  `GET …/seiten`, `PUT …/seiten/{seite}` und die Routen der Bausteine.
- `GET …/seiten` ersetzt vier Anfragen beim Öffnen eines Servers.
- Die Texte des Dashboards zu einem Feature stehen im Modul des Bots.
  Allgemeine Texte und die Sätze zu allgemeinen Codes stehen in `web/`.
- Was die Oberfläche vorher selbst prüfte und über mehrere Felder ging,
  etwa „Aktiv braucht einen Kanal“, meldet jetzt der Bot nach dem
  Speichern, am selben Feld.
- Das Dashboard hat höchstens 6 Tabs, siehe
  [Baukasten des Dashboards](../schnittstelle/baukasten.md), „Routen“.
- Die PR des Backends entfernt die alten Routen; die alte Oberfläche geht
  damit nicht mehr. Die PR des Frontends wird direkt danach gemergt.
