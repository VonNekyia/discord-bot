---
title: "0006: lru-cache als Cache"
description: Warum der Bot Werte aus der Datenbank mit lru-cache im Speicher hält, statt mit einer eigenen Map oder einem anderen Paket.
status: gilt
date: 2026-10-10
issues: []
code:
  - bot/src/cache.ts
  - bot/package.json
---

# 0006: lru-cache als Cache

## Anlass

Der Maintainer will einen Cache wie Caffeine für Java, eingesetzt, wo er
Sinn hat.

## Entscheidung

`lru-cache` 11.5 (BlueOak-1.0.0, ohne Abhängigkeiten). `ladeCache` in
`bot/src/cache.ts` setzt die Standardwerte des Bots und lädt fehlende
Werte über `fetchMethod`. Wann ein Cache Sinn hat, steht in
[Cache](../bot/cache.md), „Wann cachen“.

## Verworfene Alternativen

- **Eine eigene `Map` mit Ablaufzeit.** Für Grösse, Verdrängen und das
  einmalige Laden bei gleichzeitigen Anfragen wären es bald so viele
  Zeilen wie ein Paket, mit eigenen Fehlern.
- **`node-cache`.** Ist es voll (`maxKeys`), wirft es, statt alte Werte zu
  verdrängen; Laden bei Bedarf kann es nicht.
- **Redis.** Ein zweiter Dienst für einen Prozess. Kommt mit mehreren
  Instanzen in Frage, siehe [Cache](../bot/cache.md), „Grenzen“.

## Folgen

- Ein Paket mehr zur Laufzeit, ohne eigene Abhängigkeiten.
- Der Cache lebt im Speicher eines Prozesses und endet mit ihm.
