---
title: Datenbank
description: PostgreSQL für den Bot; Verbindung aus der Umgebung, Discord-IDs als bigint, der Pool und seine Werte, Migrationen unter Sperre und je in einer Transaktion, die Dev-Datenbank in Docker, was noch fehlt.
code:
  - bot/src/kern/datenbank.ts
  - bot/src/index.ts
  - bot/compose.yaml
  - bot/migrationen/
  - bot/migrationen/0001-sitzungen.sql
  - bot/migrationen/0002-begruessungen.sql
  - bot/migrationen/0003-bilder.sql
  - bot/migrationen/0004-sprachraeume.sql
  - bot/migrationen/0005-raeume.sql
---

# Datenbank

Der Bot nutzt PostgreSQL 18 über `pg` mit dessen eingebautem Pool, siehe
Entscheidung [0007](../entscheidungen/0007-postgres-mit-pg.md). Sie ist die
einzige Datenbank des Projekts. Beim Start wendet der Bot neue Migrationen
an und öffnet einen Pool für den ganzen Prozess. Ohne Datenbank startet er
nicht. Welche Tabellen es gibt, steht unter „Tabellen“.

## Verbindung

`verbindung` in `bot/src/kern/datenbank.ts` liest die Umgebung:

| Variable | Pflicht | Bedeutung |
|---|---|---|
| `DB_HOST` | ja | Host der Datenbank |
| `DB_PORT` | nein, Standard 5432 | Port |
| `DB_NAME` | ja | Name der Datenbank |
| `DB_USER` | ja | Nutzer |
| `DB_PASSWORD` | ja | Passwort, ein Secret |

Fehlt eine Pflichtvariable, endet der Bot mit Exit 1. Jede Sitzung setzt
`client_encoding` auf `UTF8` und `TimeZone` auf `UTC` (`options`). Der
Aufbau einer Verbindung bricht nach 10 s ab (`connectionTimeoutMillis`).

## Discord-IDs

Discord-IDs stehen in Spalten vom Typ `bigint`. PostgreSQL kennt keine
Ganzzahl ohne Vorzeichen; `bigint` reicht bis 2^63 − 1. Eine ID ist ein
Snowflake mit 64 Bit, die oberen 42 Bit zählen die Millisekunden seit
2015 ([Doku von Discord](https://discord.com/developers/docs/reference#snowflakes)).
Das oberste Bit ist darum erst ab dem Jahr 2084 gesetzt.

`pg` liefert `bigint` als Text, auch in `bigint[]`, nicht als `number`, damit über 2^53 keine
Stelle verloren geht. So bleibt es: IDs werden als Text gelesen,
verglichen und geschrieben.

## Pool

`oeffne` legt einen Pool an: Verbindungen werden wiederverwendet, statt je
Anfrage neu aufgebaut.

| Wert | Bot | Standard von `pg-pool` 3.14 | Warum |
|---|---|---|---|
| `max` | 5 | 10 | Node arbeitet die Anfragen in einem Thread ab; mehr gleichzeitige Verbindungen bringen dem Bot nichts |
| `min` | 2 | 0 | so viele freie Verbindungen schliesst der Pool nie; die erste Anfrage nach einer ruhigen Zeit baut keine neue auf |
| `idleTimeoutMillis` | 60 s | 10 s | danach schliesst eine freie Verbindung über `min` |
| `connectionTimeoutMillis` | 10 s, aus `verbindung` | 0, wartet ohne Ende | gilt für den Aufbau und für das Warten auf eine freie Verbindung; ist die Datenbank hängen geblieben, scheitern Anfragen, statt sich endlos zu stauen |
| `keepAlive`, `keepAliveInitialDelayMillis` | an, 10 s | aus | TCP-Keepalive hält freie Verbindungen durch Firewalls am Leben |

Trennt die Datenbank eine freie Verbindung, etwa bei ihrem Neustart, wirft
der Pool sie weg und meldet `error`. `oeffne` loggt dann
`Datenbank: <Meldung>`, und die nächste Anfrage baut eine neue Verbindung
auf. Ohne Zuhörer auf `error` endete der Prozess.

Bei `SIGINT` und `SIGTERM` schliesst der Bot zuerst die API, dann die
Verbindung zu Discord, dann den Pool, und endet mit Exit 0. So kommt keine
Anfrage mehr an, wenn Discord oder die Datenbank schon weg sind.

## Migrationen

`migriere` wendet jede `.sql`-Datei in `bot/migrationen/` genau einmal an,
nach Namen sortiert, und trägt sie in die Tabelle `migrationen` ein. Namen
wie `0001-server-einstellungen.sql`. Dafür öffnet es eine eigene
Verbindung, neben dem Pool.

- **Sperre.** Zuerst holt `migriere` mit `pg_advisory_lock` eine Sperre
  für die ganze Datenbank (Schlüssel `sperre`). Starten mehrere Prozesse
  gleichzeitig, wartet jeder weitere dort, bis der erste fertig ist, und
  findet dann nichts mehr zu tun. Die Sperre gehört zur Sitzung und endet
  mit der Verbindung, auch wenn der Prozess abstürzt.
- **Transaktion je Datei.** Jede Datei läuft mit ihrem Eintrag in
  `migrationen` zwischen `BEGIN` und `COMMIT`. PostgreSQL nimmt auch
  `CREATE` und `ALTER` in die Transaktion. Scheitert eine Anweisung, gilt
  nichts von der Datei, und sie ist nicht eingetragen. `migriere` wirft,
  der Bot endet mit Exit 1. Die Dateien davor bleiben angewendet.
- **Mehrere Anweisungen.** Eine Datei darf mehrere enthalten: `pg` schickt
  eine Anfrage ohne Parameter als Simple Query. Eine Anfrage mit
  Parametern kann nur eine Anweisung enthalten
  ([Doku von PostgreSQL](https://www.postgresql.org/docs/18/protocol-flow.html#PROTOCOL-FLOW-EXT-QUERY)).
  Werte stehen darum immer in Parametern (`$1`), nie im Text der Anfrage.

Eine Datei enthält kein `BEGIN`, `COMMIT` oder `ROLLBACK` und keine
Anweisung, die nicht in einer Transaktion laufen darf, etwa
`CREATE INDEX CONCURRENTLY` oder `VACUUM`.

Eine angewendete Migration wird nicht mehr geändert. Eine Korrektur ist
eine neue Datei.

## Tabellen

Jede Tabelle entsteht in einer Migration in `bot/migrationen/`; dort
stehen ihre Spalten.

| Tabelle | Migration | Inhalt | Beschrieben in |
|---|---|---|---|
| `migrationen` | `migriere` selbst | Name und Zeit jeder angewendeten Datei | „Migrationen“ oben |
| `sitzungen` | `0001-sitzungen.sql` | Sitzungen des Dashboards; Schlüssel ist der SHA-256 der Kennung | [Anmeldung am Dashboard](../schnittstelle/anmeldung.md), „Sitzung“ |
| `begruessungen` | `0002-begruessungen.sql` | eine Einstellung je Server und Art | [Begrüssung bei Beitritt und Abschied](../benutzung/begruessung.md) |
| `bilder` | `0003-bilder.sql` | Hintergrund des Banners je Server und Art, 1100 × 440 px als WebP | [API im Bot](dashboard-api.md), „Bilder“ |
| `sprachraeume` | `0004-sprachraeume.sql` | Einstellungen der Sprachräume je Server, die Erzeuger als `jsonb` | [API der Sprachräume](../schnittstelle/sprachraeume.md) |
| `raeume` | `0005-raeume.sql` | jeder Raum mit Server, Besitzer und Zeit der Anlage; `UNIQUE (server, besitzer)`: höchstens ein Raum je Mitglied und Server, auch wenn der Besitz wechselt | [Sprachräume im Bot](sprachraeume-bau.md), [Menü der Sprachräume im Bot](sprachraeume-menue.md) |

Was davon personenbezogen ist und wie lange es bleibt, steht in
[Datenschutz](datenschutz.md), „Was der Bot speichert“.

## Dev-Datenbank

`bot/compose.yaml` startet PostgreSQL 18 in Docker, nur auf `127.0.0.1`,
mit den Werten aus `bot/.env`. Die Daten liegen im Volume `daten`.

```bash
cd bot
docker compose up -d
```

Beim ersten Start legt PostgreSQL die Datenbank an und nimmt erst nach
einigen Sekunden Verbindungen an; `docker compose up -d --wait` wartet
darauf (`healthcheck` mit `pg_isready` über TCP). `docker compose down`
hält sie an, `docker compose down -v` löscht auch die Daten. In der CI
läuft dieselbe PostgreSQL als Service, siehe
[Tests](../entwicklung/tests.md), „Tests gegen PostgreSQL“.

## Was noch fehlt

- **Produktion.** Wo die Datenbank der Produktion läuft, ist offen. Ihre
  Werte kommen als GitHub-Secrets, siehe
  [Einrichtung und Betrieb](../benutzung/einrichtung.md), „Secrets“.
- **TLS.** `verbindung` setzt kein `ssl`. Läuft die Datenbank der
  Produktion nicht auf demselben Rechner wie der Bot, kommt TLS dazu.
