---
title: "0005: MariaDB über mysql2 mit eingebautem Pool"
description: Warum der Bot MariaDB über mysql2 anspricht und dessen Pool nutzt, statt des Connectors von MariaDB oder einer eigenen Pool-Bibliothek.
status: abgelöst durch 0007
date: 2026-10-10
issues: []
code:
  - bot/src/datenbank.ts
  - bot/package.json
---

# 0005: MariaDB über mysql2 mit eingebautem Pool

Abgelöst durch [0007](0007-postgres-mit-pg.md): Der Bot nutzt PostgreSQL
über `pg`.

## Anlass

Der Maintainer will eine MariaDB als Datenbank des Bots und einen Pool wie
HikariCP für Java.

## Entscheidung

`mysql2` 3.24 (MIT), Modul `mysql2/promise`. Es spricht das Protokoll von
MariaDB und bringt mit `createPool` einen Pool mit Grenze, freien
Verbindungen, Ablaufzeit und Keepalive mit. Die Werte stehen in
[Datenbank](../bot/datenbank.md), „Pool“.

## Verworfene Alternativen

- **`mariadb`, der Connector von MariaDB.** Er hat einen Pool und kennt
  MariaDB am besten, steht aber unter LGPL-2.1-or-later. Die CI lässt für
  Laufzeit-Abhängigkeiten nur permissive Lizenzen zu (`AGENTS.md`,
  Regel 27).
- **`generic-pool` über einem Treiber.** Ein zweites Paket für etwas, das
  `mysql2` selbst kann.
- **Ein ORM oder Query-Builder**, etwa Knex oder Prisma. Für Migrationen in
  SQL und wenige Abfragen braucht es keine Schicht dazwischen.

## Folgen

- `mysql2` 3.24.5 bringt 9 Pakete mit, alle unter MIT oder Apache-2.0.
- Funktionen, die nur MariaDB hat und die `mysql2` nicht kennt, fehlen.
  Für normales SQL spielt das keine Rolle.
- Der Pool hat keine Wartezeit beim Holen einer Verbindung. Die Grenze der
  Warteschlange (`queueLimit`) übernimmt diese Rolle.
