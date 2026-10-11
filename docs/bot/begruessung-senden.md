---
title: Begrüssung senden
description: Wie der Bot bei Beitritt und Abschied sendet; Ereignisse und Partial, Einstellungen aus dem Cache, Prüfung der Rechte im Kanal, Platzhalter, Erwähnungen, Banner, was ins Log geht.
code:
  - bot/src/senden.ts
  - bot/src/begruessung.ts
  - bot/src/index.ts
---

# Begrüssung senden

Was der Bot bei Beitritt und Abschied schickt, steht in
[Begrüssung bei Beitritt und Abschied](../benutzung/begruessung.md). Diese
Seite sagt, wie `begruesse` in `bot/src/senden.ts` das tut. Es läuft bei
`guildMemberAdd` und `guildMemberRemove`; beide kommen nur mit dem Intent
`GuildMembers`, der Abschied für Mitglieder ausserhalb des Caches nur mit
`Partials.GuildMember`, siehe [Intents](intents.md).

## Ablauf

1. Die Einstellungen des Servers kommen aus dem Cache `einstellungen`
   (`ladeCache` über `lese`), siehe [Cache](cache.md). Lassen sie sich
   nicht lesen, endet es mit einer Logzeile.
2. Ist die Art aus oder ohne Kanal, endet es still.
3. Der Kanal muss ein Text- oder Ankündigungskanal sein, in dem der Bot
   sehen und senden darf (`permissionsFor` mit dem Bot). Sonst endet es mit
   einer Logzeile.
4. Der Text bekommt die Platzhalter (`ersetze`, siehe unten).
5. Mit `banner` und gespeichertem Bild zeichnet `banner` das PNG. Fehlt im
   Kanal „Dateien anhängen“ oder scheitert das Zeichnen, geht nur der Text,
   mit einer Logzeile.
6. Ist der Text leer, nur aus Leerzeichen, und es gibt kein Banner, geht
   nichts.
7. `send` mit Text, Datei `beitritt.png` oder `abschied.png` und
   `allowedMentions`. Scheitert es, eine Logzeile.

## Platzhalter und Erwähnungen

`ersetze` in `bot/src/begruessung.ts` ersetzt in einem Durchgang; ein
eingesetzter Wert wird nicht noch einmal ersetzt. Im Text setzt
`maskiere` vor jedes ASCII-Satzzeichen in Namen einen Backslash. Discord
liest danach nichts davon als Markdown, als Erwähnung (`<@…>`) oder als
Emoji (`:…:`); jedes Zeichen wird höchstens doppelt so lang, wie die
längsten Werte es annehmen. Im Banner bleiben Namen roh.

| Art | `allowedMentions` | Wirkung |
|---|---|---|
| Beitritt | `{ parse: [], users: [<ID des Mitglieds>] }` | nur das neue Mitglied pingt |
| Abschied | `{ parse: [] }` | niemand pingt |

Beleg: [Allowed Mentions](https://docs.discord.com/developers/resources/message#allowed-mentions-object).

Der Name ist `displayName` von discord.js: Spitzname, sonst globaler
Anzeigename, sonst Nutzername. Ein Partial-Mitglied beim Abschied kennt
keinen Spitznamen.

## Was ins Log geht

Nur die Art und der Grund, etwa `Begrüssung beitritt: Kanal fehlt oder der
Bot darf dort nicht senden.`, bei Fehlern dazu ihr Text. Nie IDs oder
Namen, siehe [Datenschutz](datenschutz.md), „Was ins Log geht“.
