---
title: "0007: PostgreSQL über pg mit eingebautem Pool"
description: Warum der Bot PostgreSQL statt MariaDB nutzt und es über pg mit dessen Pool anspricht, statt über einen anderen Client oder ein ORM; Migrationen je in einer Transaktion unter einer Sperre.
status: gilt
date: 2026-10-11
issues: []
code:
  - bot/src/kern/datenbank.ts
  - bot/package.json
  - bot/compose.yaml
  - .github/workflows/backend.yml
---

# 0007: PostgreSQL über pg mit eingebautem Pool

Löst [0005](0005-mysql2-mit-eingebautem-pool.md) ab.

## Anlass

Der Maintainer will PostgreSQL als einzige Datenbank des Projekts. Nach
dem Bot kommen Dashboard, Sitzungen, Begrüssungen und hochgeladene Bilder
dazu; alles liegt dort. Mit MariaDB waren zwei Lücken offen: Eine
Migration, die in der Mitte abbrach, blieb halb angewendet, weil MariaDB
`CREATE` und `ALTER` nicht in eine Transaktion nimmt. Und zwei Instanzen
konnten dieselbe Migration zugleich anwenden.

## Entscheidung

PostgreSQL 18, Support bis November 2030, angesprochen über `pg` 8.23
(MIT) mit dessen eingebautem `Pool`, ohne ORM. Discord-IDs stehen als
`bigint` in der Datenbank und kommen als Text zurück. `migriere` wendet
jede Datei mit ihrem Eintrag in einer eigenen Transaktion an und hält
dabei eine Sperre mit `pg_advisory_lock`. Die Werte des Pools und die
Regeln für Migrationen stehen in [Datenbank](../bot/datenbank.md).

## Verworfene Alternativen

- **MariaDB behalten.** Kein Umbau, aber DDL bliebe ohne Transaktion, und
  der Maintainer will PostgreSQL für alles.
- **`postgres` 3.4 (Unlicense).** Ohne eigene Abhängigkeiten und mit
  eigenen Typen. Anfragen schreibt man dort als Template-Strings, eine
  eigene Schreibweise neben SQL; mehrere Anweisungen gehen nur über
  `.simple()` oder `sql.file`. Sein Pool kennt kein `min`. `pg` nimmt
  SQL und Parameter (`$1`) wie bisher, und `Pool.query` passt zu `misse`
  und den Tests ohne Umbau.
- **Ein ORM oder Query-Builder**, etwa Prisma, Drizzle oder Knex. Für
  Migrationen in SQL und wenige Abfragen braucht es keine Schicht
  dazwischen.
- **Ein Paket für Migrationen.** `migriere` sind rund 30 Zeilen, mit
  Sperre und Transaktion.

## Folgen

- `pg` 8.23.1 bringt 14 Pakete zur Laufzeit mit, 12 unter MIT und 2 unter
  ISC (`pg-int8`, `split2`). `pg` hat keine eigenen Typen; dafür kommt
  `@types/pg` als Dev-Abhängigkeit dazu, siehe
  [0003](0003-tsc-und-node-test.md).
- Der Pool meldet Fehler freier Verbindungen als Ereignis `error`. Ohne
  Zuhörer endet der Prozess; `oeffne` hängt einen an.
- PostgreSQL kennt keine Ganzzahl ohne Vorzeichen. Discord-IDs passen bis
  2084 in `bigint`, siehe [Datenbank](../bot/datenbank.md), „Discord-IDs“.
- Eine Migration enthält kein `BEGIN` oder `COMMIT` und nichts, was
  ausserhalb einer Transaktion laufen muss.
- Lokal braucht die Dev-Datenbank wie bisher Docker. Daten einer
  Dev-MariaDB werden nicht übernommen; Tabellen mit Daten gab es noch
  keine.
