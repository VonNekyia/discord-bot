---
title: Intents
description: Welche Gateway-Intents und Partials der Bot anfordert und warum; welche er bewusst nicht anfordert, und was vor einem neuen privilegierten Intent zu tun ist.
code:
  - bot/src/index.ts
  - bot/src/discord/client.ts
---

# Intents

Der Bot fordert `Guilds` und `GuildMembers` an, dazu
`Partials.GuildMember` (`erstelleClient` in `bot/src/discord/client.ts`).
Slash-Befehle kommen als Interaktion und brauchen keinen weiteren Intent.
Jeder neue Intent braucht einen Befehl oder eine Funktion, die ihn braucht,
und eine Zeile hier (`AGENTS.md`, Regel 24).

| Intent | Angefordert | Grund |
|---|---|---|
| `Guilds` | ja | discord.js braucht ihn für den Cache von Servern und Kanälen |
| `GuildMembers` | ja | privilegiert; Discord schickt `GUILD_MEMBER_ADD` und `GUILD_MEMBER_REMOVE` nur mit ihm, und die [Begrüssung bei Beitritt und Abschied](../benutzung/begruessung.md) braucht genau diese Ereignisse |
| `GuildVoiceStates` | ja | nicht privilegiert; Discord meldet Betreten und Verlassen von Sprachkanälen nur mit ihm, und die [Sprachräume](../benutzung/sprachraeume.md) brauchen genau das |
| `GuildPresences` | nein | privilegiert; nichts braucht den Status |
| `MessageContent` | nein | privilegiert; Befehle kommen als Interaktion, nicht als Nachricht |

Was privilegiert ist und was jeder Intent liefert, steht in der
[Doku von Discord](https://docs.discord.com/developers/events/gateway#list-of-intents).

## Ein privilegierter Intent kommt dazu

Fordert der Bot einen privilegierten Intent an, der im Developer Portal
nicht an ist, schliesst Discord die Verbindung mit 4014. Der Bot endet mit
Exit 1, und der Dienst startet ihn immer wieder neu, siehe
[Wiederanlauf](wiederanlauf.md). Darum gilt diese Reihenfolge:

1. Der Maintainer schaltet den Intent im Developer Portal an, Seite „Bot“.
2. [Einrichtung und Betrieb](../benutzung/einrichtung.md), „Einstellungen
   im Developer Portal“, zeigt den neuen Stand.
3. Erst dann wird die PR gemergt, die den Intent anfordert.

Ab 100 Servern braucht der Bot eine Verifizierung, und Discord muss jeden
privilegierten Intent danach freigeben
([Privileged Intents](https://docs.discord.com/developers/events/gateway#privileged-intents)).

## Partials

Mit `GuildMembers` kommt `Partials.GuildMember` dazu. discord.js meldet
`guildMemberRemove` sonst nur für Mitglieder, die es im Cache hat
(`GuildMemberRemove` in `client/actions/`), und der Cache hält nur wenige
Mitglieder, siehe [Datenschutz](datenschutz.md), „Was der Bot speichert“.
Ohne das Partial fiele fast jeder Abschied still aus.

Ein Partial-Mitglied kennt seinen Spitznamen auf dem Server nicht. Was das
für die Platzhalter heisst, steht in
[Begrüssung bei Beitritt und Abschied](../benutzung/begruessung.md),
„Platzhalter“.
