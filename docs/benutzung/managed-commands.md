---
title: Managed Commands
description: Die Befehle /ban, /kick und /warn mit vorgefertigten oder eigenen Gründen, wer sie nutzen darf, Limits je Rolle über 7 Tage, die DM beim Bann und bei der Verwarnung, Rollenhierarchie, Rechte, Antworten und Fehler.
code:
  - bot/src/discord/befehle.ts
  - bot/src/discord/modul.ts
  - bot/src/discord/moderation.ts
  - bot/src/discord/mitglieder.ts
  - bot/src/module/strafen/befehle.ts
  - bot/src/module/strafen/modul.ts
---

# Managed Commands

Mit `/ban`, `/kick` und `/warn` bannt, kickt oder verwarnt ein Mitglied
des Teams ein anderes Mitglied, mit einem Grund aus einer Liste oder einem
eigenen. Wer die Befehle nutzen darf und wie oft je Woche, stellt das Team
je Rolle im Dashboard ein, siehe [API der Managed Commands](../schnittstelle/strafen.md).
Beim Bann kann der Bot dem Gebannten vorher eine DM schicken, mit dem
Grund und wie man entbannt wird; bei der Verwarnung schickt er immer eine.
Das Modul kostet etwas und ist nur an, wenn es auf dem Server
freigeschaltet ist, siehe [Board der Module](../schnittstelle/module.md).
Warum es so gebaut ist, steht in
[0021](../entscheidungen/0021-managed-commands.md), die Bezahlung in
[0020](../entscheidungen/0020-bezahlte-module.md). Gebaut ist es in
`bot/src/module/strafen/`; die Discord-Schicht dazu steht in
`bot/src/discord/moderation.ts`.

## Befehle

| Befehl | Optionen | tut | Rechte des Bots |
|---|---|---|---|
| `/ban` | `nutzer` (Nutzer), `grund` | bannt; mit `dm` vorher eine DM | Mitglieder bannen |
| `/kick` | `nutzer` (Mitglied), `grund` | kickt | Mitglieder kicken |
| `/warn` | `nutzer` (Mitglied), `grund` | schickt den Grund als DM und speichert die Verwarnung | keine |

- Alle drei gibt es nur auf Servern, nicht in DMs (`contexts` nur
  `GUILD`). Sie sind global registriert und stehen darum auf jedem Server;
  wo das Modul aus ist, antworten sie nur, dass es aus ist.
- `default_member_permissions` setzt der Bot nicht; wer die Befehle nutzen
  darf, prüft er selbst, siehe „Wer darf“. Ein Server kann sie in den
  Einstellungen unter „Integrationen“ weiter einschränken
  ([Application Command Permissions](https://docs.discord.com/developers/interactions/application-commands#permissions)).
- Jede Antwort geht nur an den, der den Befehl nutzt (ephemeral), und
  erwähnt niemanden.

## Grund

`grund` ist Text mit Autocomplete, Pflicht, höchstens 400 Zeichen
(`max_length`).

- **Vorschläge:** die Gründe aus dem Dashboard, die den getippten Text
  enthalten, gross und klein gleich, höchstens 24, in ihrer Reihenfolge;
  dahinter immer „Eigener Grund …“ mit dem Wert `custom`. Ist das Modul
  aus, kommt eine leere Liste. Ebenso für jeden, der die Befehle nicht
  nutzen darf, siehe „Wer darf“: Weil die Befehle ohne
  `default_member_permissions` jedem Mitglied angezeigt werden, sähe sonst
  jeder die Liste der Gründe.
- **„Eigener Grund …“:** Statt den Befehl auszuführen, öffnet der Bot ein
  Formular „Eigener Grund“ mit einem Textfeld von 1 bis 400 Zeichen. Erst
  wer es abschickt, bannt, kickt oder verwarnt. Ein Formular muss die
  erste Antwort auf den Befehl sein
  ([Interaction Callback Type](https://docs.discord.com/developers/interactions/receiving-and-responding#interaction-response-object-interaction-callback-type));
  darum prüft der Bot alles andere erst danach.
- **Freier Text:** Discord lässt bei Autocomplete auch Werte zu, die
  nicht vorgeschlagen wurden
  ([Autocomplete](https://docs.discord.com/developers/interactions/application-commands#autocomplete)).
  Der Bot nimmt so einen Text als eigenen Grund, ohne Formular.
- Leerzeichen am Anfang und Ende schneidet der Bot ab; bleibt nichts,
  antwortet er, dass der Grund fehlt.
- Die Länge prüft der Bot selbst, gezählt wie `String.length`: Ob Discord
  `max_length` auch bei freiem Text mit Autocomplete durchsetzt, ist nicht
  belegt. Bei mehr als 400 Zeichen antwortet er nur, siehe „Antworten“,
  und tut nichts.

## Wer darf

1. Der Eigentümer des Servers und Mitglieder mit „Administrator“ dürfen
   immer, ohne Limit.
2. Sonst braucht man eine Rolle aus `limits`. Hat man mehrere, gilt das
   höchste Limit unter ihnen, für Bans und Kicks je für sich.
3. `/warn` hat kein Limit, braucht aber eine Rolle aus der Liste wie die
   anderen beiden.

## Limit

Das Limit zählt rollierend die letzten 7 Tage, also 168 Stunden vor dem
Befehl, je Mitglied des Teams und Server, Bans und Kicks getrennt. Es
zählen nur Bans und Kicks, die geklappt haben. Ist das Limit erreicht,
sagt die Antwort, wann der nächste wieder geht: 7 Tage nach dem ältesten,
der noch zählt. Ein Limit von 0 heisst: Diese Rolle darf nicht bannen
oder kicken. Zwei Befehle desselben Mitglieds zur selben Zeit zählen
nacheinander, damit keiner am Limit vorbeikommt. Die Sperre dafür liegt im
Speicher des Prozesses (`Strafbefehle` in
`bot/src/module/strafen/befehle.ts`) und deckt Zählen, DM, Bann oder Kick
und Eintragen ab. Das genügt, solange ein Server nur von einem Prozess
bedient wird: Alle Interaktionen eines Servers kommen über seinen Shard.
Bedienen einmal zwei Prozesse denselben Server, braucht es eine Sperre in
PostgreSQL.

## Ziel

Der Bot führt einen Befehl nicht aus, wenn das Ziel:

- man selbst ist, der Bot selbst oder der Eigentümer des Servers;
- bei `/kick` und `/warn` kein Mitglied des Servers ist; `/ban` geht auch
  für Nutzer, die nicht auf dem Server sind;
- eine höchste Rolle hat, die so hoch oder höher ist als die höchste Rolle
  dessen, der den Befehl nutzt; ausser für den Eigentümer;
- bei `/ban` und `/kick` eine höchste Rolle hat, die so hoch oder höher ist
  als die höchste Rolle des Bots. Discord erlaubt einem Bot nur, Mitglieder
  zu kicken oder zu bannen, deren höchste Rolle niedriger ist als seine
  ([Permission Hierarchy](https://docs.discord.com/developers/topics/permissions#permission-hierarchy)).

Die zweite Regel ist eine eigene: Sonst könnte jemand mit einer Rolle aus
der Liste über den Bot Mitglieder bannen, die über ihm stehen.

## Ablauf

1. Ist das Modul aus, die Antwort, dass es aus ist.
2. Ist `grund` `custom`, gross oder klein, das Formular; weiter, wenn es
   abgeschickt ist. Ist das Modul inzwischen aus, antwortet der Bot auch
   dann, dass es aus ist: Jedes Formular prüft das wie ein Befehl
   (`haengeAn` in `bot/src/discord/modul.ts`).
3. Die Antwort aufschieben (`deferReply`), denn Discord wartet höchstens
   3 s auf die erste
   ([Interaction Callback](https://docs.discord.com/developers/interactions/receiving-and-responding#responding-to-an-interaction)).
4. Prüfen: wer darf, das Ziel, die Rechte des Bots, das Limit.
5. `/ban` mit `dm`: die DM an den Gebannten, `dmText` mit `{server}` und
   `{grund}`, darunter `entbannung`. Danach den Bann, ohne Nachrichten zu
   löschen (`delete_message_seconds` 0,
   [Create Guild Ban](https://docs.discord.com/developers/resources/guild#create-guild-ban)).
   Die DM kommt vorher, weil der Gebannte danach keinen Server mehr mit dem
   Bot teilt.
6. `/kick`: den Kick
   ([Remove Guild Member](https://docs.discord.com/developers/resources/guild#remove-guild-member)).
7. `/warn`: die DM „Verwarnung auf {server}: {grund}“, dann die
   Verwarnung speichern.
8. Bann und Kick tragen den Grund im Audit-Log, `<grund> · /<befehl> von
   <Benutzername>`, auf 512 Zeichen gekürzt
   ([Audit Log](https://docs.discord.com/developers/resources/audit-log)).
9. Die Antwort, siehe „Antworten“.

Scheitert die DM, weil das Mitglied keine DMs vom Bot annimmt (Discord
antwortet 50007, „Cannot send messages to this user“,
[JSON Error Codes](https://docs.discord.com/developers/topics/opcodes-and-status-codes#json-json-error-codes)),
geht der Rest trotzdem, und die Antwort sagt das. Scheitert sie anders,
ebenso. Die Sätze dazu stehen unter „Antworten“.

Hakenkreuze und SS-Runen schreibt der Bot nie, auch nicht aus dem Namen
des Ziels, des Servers, dem Grund oder dem Text der DM. Der Filter aus
Entscheidung [0018](../entscheidungen/0018-zierbuchstaben-und-filter.md)
läuft auf der fertigen DM, der Antwort und dem Grund im Audit-Log.

## Antworten

| Fall | Antwort |
|---|---|
| gebannt | „<Name> ist gebannt. Grund: <grund>.“, dazu, ob die DM ankam, siehe unten, und „Bans in 7 Tagen: n von m.“, ohne Limit ohne diesen Satz |
| gekickt | ebenso mit „gekickt“ und „Kicks in 7 Tagen“ |
| verwarnt | „<Name> ist verwarnt, zum n. Mal. Grund: <grund>.“, dazu, ob die DM ankam, siehe unten; n zählt die Verwarnungen dieses Mitglieds auf diesem Server in den letzten `verwarnungTage` Tagen, Standard 365, siehe [API der Managed Commands](../schnittstelle/strafen.md). Zwei `/warn` auf dasselbe Mitglied laufen nacheinander, also lautet n nie zweimal gleich |
| der Grund ist leer | „Der Grund fehlt.“ |
| der Grund hat mehr als 400 Zeichen | „Der Grund ist zu lang, höchstens 400 Zeichen.“ |
| keine Rolle aus der Liste | „Du darfst diesen Befehl hier nicht nutzen.“ |
| Limit 0 für alle eigenen Rollen | „Deine Rollen dürfen nicht bannen.“, ebenso für Kicks |
| Limit erreicht | „Du hast dein Limit erreicht: m Bans in 7 Tagen. Der nächste geht ab <Zeit>.“ |
| Ziel geht nicht | je Regel aus „Ziel“ ein Satz |
| dem Bot fehlt ein Recht oder die Hierarchie, Discord antwortet 50013 | „kitty fehlt das Recht dazu, oder die Rolle von kitty steht zu tief.“ |
| das Mitglied ist schon weg (10007) oder kein Nutzer (10013) | „Diesen Nutzer gibt es auf dem Server nicht mehr.“ |
| der Bann scheitert, nachdem die DM ankam | der Satz des Fehlers aus dieser Tabelle, dazu „Die DM an das Mitglied kam schon an.“; die DM geht vor dem Bann, weil danach keine mehr ankommt |
| jeder andere Fehler | „Das hat nicht geklappt.“, siehe [Befehle](befehle.md), „Fehler“ |

Ob die DM ankam, sagt ein Satz; der Befehl geht in jedem Fall weiter:

| DM | Satz |
|---|---|
| angekommen | „Die DM ist angekommen.“ |
| das Mitglied nimmt keine DMs vom Bot an (50007 oder 50278, `kein_dm`) | „Die DM kam nicht an; das Mitglied nimmt keine DMs von kitty an.“ |
| jeder andere Fehler, etwa ein 5xx | „Die DM kam nicht an.“, und eine Zeile `/<befehl>: DM nicht gesendet: <Fehler>` ins Log |

Ohne DM fehlt der Satz: beim Kick, beim Bann ohne DM in den Einstellungen
und beim Bann eines Nutzers, der nicht auf dem Server ist.

`<Zeit>` ist ein Zeitstempel von Discord (`<t:…:R>`), den jeder in seiner
Zeitzone sieht
([Message Formatting](https://docs.discord.com/developers/reference#message-formatting)).

## Rechte und Intent

| Recht des Bots | wofür |
|---|---|
| Mitglieder bannen (`BAN_MEMBERS`) | `/ban` ([Create Guild Ban](https://docs.discord.com/developers/resources/guild#create-guild-ban)) |
| Mitglieder kicken (`KICK_MEMBERS`) | `/kick` ([Remove Guild Member](https://docs.discord.com/developers/resources/guild#remove-guild-member)) |

Beide verlangen auf Servern mit Zwei-Faktor-Pflicht für Moderation, dass
das Konto des Eigentümers der Anwendung 2FA nutzt
([Permissions](https://docs.discord.com/developers/topics/permissions#permissions-bitwise-permission-flags)).
Fehlt dem Bot eins, steht im Dashboard ein Hinweis, und der Befehl
antwortet, dass das Recht fehlt. Die Rolle des Bots muss über den Rollen
stehen, die er bannen oder kicken soll, siehe „Ziel“.

Einen neuen Intent brauchen die Befehle nicht: Sie kommen als
Interaktion, die Rollen von Ziel und Nutzer stehen in der Interaktion,
nach dem Formular holt der Bot das Ziel über die REST-API (`zielAuf` in
`bot/src/discord/moderation.ts`), und Bann, Kick und DM gehen ebenso über
die REST-API. Siehe [Intents](../bot/intents.md).

## Was noch fehlt

- Entbannen per Befehl, etwa `/unban`.
- Eine DM beim Kick.
- Eine Liste der Verwarnungen im Dashboard. Das Modul Log zeigt die
  Aktionen der Managed Commands, wenn es kommt.
