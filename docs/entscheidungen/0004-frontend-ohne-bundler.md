---
title: "0004: Die Oberfläche ohne Bundler"
description: Warum web/ statisches HTML mit tsc ist, ohne Vite oder einen anderen Bundler, und warum ein eigener kleiner Server die CI bedient.
status: gilt
date: 2026-10-10
issues: []
code:
  - web/package.json
  - web/serve.mjs
---

# 0004: Die Oberfläche ohne Bundler

## Anlass

Die Oberfläche soll TypeScript sein und die Lighthouse- und Header-Prüfung
der Website bestehen. Heute ist sie eine Startseite mit einem kleinen
Skript.

## Entscheidung

Statisches HTML und CSS, das Skript aus `web/src/` baut `tsc` nach
`web/dist/`. Lokal und in der CI liefert `web/serve.mjs` (`node:http`) aus,
mit den Headern aus `web/_headers`. Dev-Abhängigkeiten sind nur
`typescript` und `@lhci/cli`.

## Verworfene Alternativen

- **Vite.** Bündeln, Hot Reload und Hashes in Dateinamen braucht eine
  Seite mit einem Skript nicht. Vite kommt, wenn die Oberfläche mehrere
  Module mit Abhängigkeiten lädt, mit einer neuen Entscheidung.
- **Ein fertiger Static-Server**, etwa `http-server`. Er setzt die Header
  aus `_headers` nicht; die Prüfung der Header wäre dann sinnlos.
- **Python `http.server`** wie die Website. Auch ohne Header, und ein
  zweites Laufzeitsystem nur für die CI.

## Folgen

- Kein Bündeln, kein Minifizieren. Bei einem Skript ohne Abhängigkeit
  kostet das nichts Messbares; Lighthouse misst 1,0 für Performance.
- Importiert die Oberfläche einmal ein Paket aus `node_modules`, reicht
  `tsc` nicht mehr: Dann kommt Vite.
