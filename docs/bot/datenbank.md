---
title: Datenbank
description: MariaDB für den Bot; Verbindung aus der Umgebung, der Pool und seine Werte, Migrationen, die Dev-Datenbank in Docker, was noch fehlt.
code:
  - bot/src/datenbank.ts
  - bot/src/index.ts
  - bot/compose.yaml
  - bot/migrationen/.gitkeep
---

# Datenbank

Der Bot nutzt MariaDB 11.4 über `mysql2` mit dessen eingebautem Pool, siehe
Entscheidung [0005](../entscheidungen/0005-mysql2-mit-eingebautem-pool.md).
Beim Start wendet er neue Migrationen an und öffnet einen Pool für den
ganzen Prozess. Ohne Datenbank startet er nicht. Tabellen mit Daten gibt es
noch keine; heute misst nur `/ping` die Datenbank.

## Verbindung

`verbindung` in `bot/src/datenbank.ts` liest die Umgebung:

| Variable | Pflicht | Bedeutung |
|---|---|---|
| `DB_HOST` | ja | Host der Datenbank |
| `DB_PORT` | nein, Standard 3306 | Port |
| `DB_NAME` | ja | Name der Datenbank |
| `DB_USER` | ja | Nutzer |
| `DB_PASSWORD` | ja | Passwort, ein Secret |

Fehlt eine Pflichtvariable, endet der Bot mit Exit 1. Jede Verbindung nutzt
`utf8mb4`, rechnet Zeiten in UTC (`timezone: 'Z'`) und bricht nach 10 s
Verbindungsaufbau ab. Zahlen über 2^53, etwa Discord-IDs in
`BIGINT UNSIGNED`, kommen als Text zurück (`bigNumberStrings`), damit keine
Stelle verloren geht.

## Pool

`oeffne` legt einen Pool an, wie HikariCP es für Java tut: Verbindungen
werden wiederverwendet, statt je Anfrage neu aufgebaut.

| Wert | Bot | Standard von mysql2 3.24 | Warum |
|---|---|---|---|
| `connectionLimit` | 5 | 10 | Node arbeitet die Anfragen in einem Thread ab; mehr gleichzeitige Verbindungen bringen dem Bot nichts |
| `maxIdle` | 2 | wie `connectionLimit` | ruhige Zeiten halten nur 2 Verbindungen offen |
| `idleTimeout` | 60 s | 60 s | danach schliesst eine überzählige freie Verbindung |
| `queueLimit` | 100 | unbegrenzt | ist die Datenbank hängen geblieben, scheitern Anfragen, statt sich endlos zu stauen |
| `enableKeepAlive`, `keepAliveInitialDelay` | an, 10 s | an, sofort | TCP-Keepalive hält freie Verbindungen durch Firewalls am Leben |

Bei `SIGINT` und `SIGTERM` schliesst der Bot zuerst die Verbindung zu
Discord, dann den Pool, und endet mit Exit 0.

## Migrationen

`migriere` wendet jede `.sql`-Datei in `bot/migrationen/` genau einmal an,
nach Namen sortiert, und trägt sie in die Tabelle `migrationen` ein. Namen
wie `0001-server-einstellungen.sql`. Eine Datei darf mehrere Anweisungen
enthalten; dafür öffnet `migriere` eine eigene Verbindung mit
`multipleStatements`. Der Pool hat das nicht, damit eine eingeschleuste
Anweisung nie mitläuft.

Eine angewendete Migration wird nicht mehr geändert. Eine Korrektur ist
eine neue Datei.

## Dev-Datenbank

`bot/compose.yaml` startet MariaDB 11.4 in Docker, nur auf `127.0.0.1`,
mit den Werten aus `bot/.env`. Die Daten liegen im Volume `daten`.

```bash
cd bot
docker compose up -d
```

`docker compose down` hält sie an, `docker compose down -v` löscht auch
die Daten. In der CI läuft dieselbe MariaDB als Service, siehe
[Tests](../entwicklung/tests.md), „Tests gegen MariaDB“.

## Was noch fehlt

- **Mehrere Instanzen.** Starten zwei Bots gleichzeitig, könnten beide
  dieselbe Migration anwenden. Kommt eine zweite Instanz, sperrt
  `migriere` vorher mit `GET_LOCK`.
- **Halbe Migrationen.** MariaDB nimmt `CREATE` und `ALTER` nicht in eine
  Transaktion. Bricht eine Datei in der Mitte ab, ist ihr Anfang schon
  angewendet, aber nicht eingetragen. Dann von Hand richten und den Bot
  neu starten.
- **Produktion.** Wo die Datenbank der Produktion läuft, ist offen. Ihre
  Werte kommen als GitHub-Secrets, siehe
  [Einrichtung und Betrieb](../benutzung/einrichtung.md), „Secrets“.
