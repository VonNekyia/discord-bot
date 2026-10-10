---
title: Wiederanlauf
description: Was nach einem Verbindungsabbruch zum Gateway passiert, wann der Bot endet und was der Dienst dann tut.
code:
  - bot/src/index.ts
---

# Wiederanlauf

discord.js verbindet sich nach einem Abbruch selbst neu und setzt die
Sitzung fort, wo es geht. Der Bot loggt das nur. Kann discord.js nicht
weitermachen, endet der Bot mit Exit 1, und der Dienst startet ihn neu,
siehe [Einrichtung und Betrieb](../benutzung/einrichtung.md), „Betrieb“.

## Was der Bot loggt

| Ereignis | Log |
|---|---|
| `ShardReconnecting` | `Shard <n>: verbinde neu.` |
| `ShardResume` | `Shard <n>: wieder verbunden.` |
| `ShardDisconnect` | `Shard <n>: getrennt mit Code <code>, beende.`, dann Exit 1 |
| `Error` | `Fehler: <Meldung>` |

## Wann discord.js aufgibt

`ShardDisconnect` kommt nur bei Codes, nach denen ein neuer Versuch nichts
bringt (`UNRECOVERABLE_CLOSE_CODES` in discord.js 14.27): 4004 Token
falsch, 4010 und 4011 Sharding, 4012 API-Version, 4013 und 4014 Intents.
Die Codes stehen in der
[Doku von Discord](https://discord.com/developers/docs/topics/opcodes-and-status-codes#gateway-gateway-close-event-codes).
Hier hilft auch der Neustart durch den Dienst nicht; ein Mensch muss Token
oder Intents richten. Der Abstand zwischen den Neustarts hält die Zahl
der Anmeldungen klein.

## Was nicht getestet ist

Den Gateway gibt es in den Tests nicht. Der Bot hält keinen Zustand, der
einen Abbruch überleben müsste. Kommt solcher Zustand dazu, kommt auch ein
Test mit gemocktem Gateway.
