---
title: Intents
description: Welche Gateway-Intents der Bot anfordert und warum; welche er bewusst nicht anfordert.
code:
  - bot/src/index.ts
---

# Intents

Der Bot fordert nur `Guilds` an (`new Client` in `bot/src/index.ts`).
Slash-Befehle kommen als Interaktion und brauchen keinen weiteren Intent.
Jeder neue Intent braucht einen Befehl, der ihn braucht, und eine Zeile
hier (`AGENTS.md`, Regel 24).

| Intent | Angefordert | Grund |
|---|---|---|
| `Guilds` | ja | discord.js braucht ihn für den Cache von Servern und Kanälen |
| `GuildMembers` | nein | privilegiert; kein Befehl braucht Mitgliederlisten |
| `GuildPresences` | nein | privilegiert; kein Befehl braucht den Status |
| `MessageContent` | nein | privilegiert; Befehle kommen als Interaktion, nicht als Nachricht |

Was privilegiert ist und was jeder Intent liefert, steht in der
[Doku von Discord](https://discord.com/developers/docs/events/gateway#gateway-intents).
Fordert der Bot einen privilegierten Intent an, der im Developer Portal
nicht an ist, schliesst Discord die Verbindung mit 4014, siehe
[Wiederanlauf](wiederanlauf.md).
