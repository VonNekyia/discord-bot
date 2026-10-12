---
title: "0015: Feature-Module und eigene Schichten"
description: Warum bot/ und web/ in Feature-Module und Schichten geteilt sind, mit einer eigenen Schicht über discord.js und der API als einziger Verbindung zum Bot, und warum der Umbau in Stufen geht.
status: gilt
date: 2026-10-12
issues: [28]
code:
  - bot/.oxlintrc.json
  - web/.oxlintrc.json
---

# 0015: Feature-Module und eigene Schichten

Teilweise abgelöst durch [0017](0017-dashboard-als-baukasten.md): Die
Oberfläche hat keine Ordner je Modul; sie baut die Seiten, die die Module
im Bot anmelden, aus `web/src/bausteine/`.

## Anlass

Der Maintainer will auf einen Blick sehen, dass jede Feature-Suite ein
Modul ist: Begrüssung bei Beitritt und Abschied, Sprachräume, später
Strafen. Anfragen an discord.js und vom Dashboard an den Bot sollen über
eigene Schnittstellen laufen. Stand vorher:

- 29 Dateien flach in `bot/src/`, 7 in `web/src/`;
- discord.js direkt in 11 von 17 Dateien des Bots, Tests und Testhilfe nicht gezählt;
- die API importierte jedes Feature;
- die API, die Begrüssung und die Sprachräume holten den Fehlertext fürs
  Log aus `befehle.ts`.

## Entscheidung

`bot/` und `web/` sind in Schichten und Feature-Module geteilt, wie in
[Struktur von Bot und Oberfläche](../entwicklung/struktur.md):

- **Bot:** `kern/`, `discord/`, `api/` und je Feature ein Ordner unter
  `module/`.
- **Oberfläche:** `api/`, `kern/` und je Feature ein Ordner unter
  `module/`, eingebunden von `dashboard.ts`.

Nur `bot/src/discord/` spricht mit discord.js, nur `web/src/api/` mit dem
Bot, kein Modul importiert ein anderes. Der Linter prüft die Grenzen.

Der erste Schritt verschiebt nur Dateien und zieht den Fehlertext nach
`bot/src/kern/fehler.ts`; das Verhalten bleibt gleich. Die Discord-Schicht,
die Routen je Modul und das Aufräumen je Modul kommen in eigenen PRs.
Bis dahin melden die Grenzen in `bot/src/api/` und `bot/src/module/`
Warnungen mit Obergrenze.

## Verworfene Alternativen

- **Alles in einer PR umbauen.** Die Discord-Schicht, Routen je Modul und
  neue Tests auf einmal wären zu gross zum Prüfen und änderten Verhalten
  an vielen Stellen zugleich.
- **Nach Art statt nach Feature ordnen**, etwa `routen/`, `ereignisse/`,
  `dienste/`. Ein Feature läge über viele Ordner verstreut; der Maintainer
  will ein Modul je Feature.
- **Ein Paket je Modul mit npm-Workspaces.** Mehr `package.json`,
  Lockfiles und Schritte im Build; die Grenzen prüft der Linter auch so
  (`AGENTS.md`, Regel 23).
- **Typen von discord.js in Modulen erlauben, nur die Aufrufe kapseln.**
  Tests müssten weiter den Client von discord.js nachbauen, und ein Update
  von discord.js träfe jedes Modul.

## Folgen

- Neuer Code gehört in den Ordner seines Moduls oder seiner Schicht.
- Pfade in `docs/` und in den Skills nennen die neuen Orte.
- Bis der Umbau fertig ist, zeigt der Linter, was noch fehlt; die
  Obergrenze verhindert neue Verstösse.
- Strafen bekommt seinen Ordner, wenn der Auftrag kommt.
