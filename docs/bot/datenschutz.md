---
title: Datenschutz
description: Welche Daten von Discord der Bot speichert, wie lange, und was ins Log geht.
code:
  - bot/src/module/befehle/befehle.ts
  - bot/src/discord/befehle.ts
  - bot/src/kern/fehler.ts
  - bot/src/index.ts
  - bot/src/kern/cache.ts
  - bot/src/kern/datenbank.ts
  - bot/src/discord/client.ts
  - bot/src/api/server.ts
  - bot/src/api/anmeldung.ts
  - bot/src/module/sprachraeume/knoepfe.ts
  - bot/src/kern/zaehlung.ts
  - bot/src/discord/oauth.ts
  - bot/src/discord/eigentuemer.ts
  - bot/src/brett/freischaltung.ts
  - bot/src/discord/kaeufe.ts
  - bot/src/module/strafen/befehle.ts
---

# Datenschutz

IDs, Namen und Nachrichten von Discord sind personenbezogen. Der Bot
speichert nur, was unten steht, und schreibt nichts davon ins Log. Wer
etwas speichern will, trägt es vorher hier ein: was, wozu, wie lange, wie
es gelöscht wird. Zeilen mit „kommt mit …“ sind beschlossen, aber noch
nicht gebaut.

## Was der Bot speichert

| Daten | Wozu | Wie lange | Stand |
|---|---|---|---|
| Sitzung: SHA-256 der Kennung, Discord-ID, Name, Avatar-Hash, IDs der Server mit „Server verwalten“, Ablaufdatum | Anmeldung am Dashboard, Liste der Server | 7 Tage ab Anmeldung; Abmelden löscht sofort, abgelaufene löscht der Bot spätestens nach einem Tag | gebaut |
| Begrüssung je Server und Art: Server-ID, Kanal-ID, Schalter, Texte | Nachricht bei Beitritt und Abschied | bis das Team sie ändert oder der Bot den Server verlässt | gebaut |
| Bild je Server und Art, beim Hochladen auf 1100 × 440 px zugeschnitten und neu kodiert, ohne Metadaten wie EXIF oder GPS; es kann Personen zeigen | Hintergrund des Banners | bis es ersetzt oder gelöscht wird oder der Bot den Server verlässt | gebaut |
| Sprachräume je Server: Server-ID, Schalter, Erzeuger mit Kanal-ID, Kategorie-ID, Namensvorlage und Limit | Räume anlegen | bis das Team sie ändert oder der Bot den Server verlässt | gebaut |
| Raum: Server-ID, Kanal-ID, Discord-ID des Besitzers, Zeit der Anlage | wissen, welche Kanäle Räume sind und wem sie gehören, auch nach einem Neustart | bis der Raum gelöscht ist, der Besitz wechselt oder der Bot den Server verlässt; beim Start vergisst der Bot Räume, die es nicht mehr gibt | gebaut |
| Managed Commands je Server: Server-ID, vorgefertigte Gründe, Rollen-IDs mit Limits, Text der DM und zur Entbannung, Frist der Verwarnungen | die Befehle `/ban`, `/kick` und `/warn`, siehe [API der Managed Commands](../schnittstelle/strafen.md) | bis das Team sie ändert oder der Bot den Server verlässt | gebaut |
| Ban oder Kick: Server-ID, Discord-ID dessen, der den Befehl nutzt, Art, Zeit; nicht das Ziel und nicht der Grund | das Limit je Rolle, siehe [Managed Commands](../benutzung/managed-commands.md), „Limit“ | 7 Tage; der Bot löscht ältere Zeilen mindestens stündlich, und wenn er den Server verlässt | gebaut |
| Verwarnung: Server-ID, Discord-ID des Verwarnten und dessen, der verwarnt, Grund, Zeit | die Zahl in „verwarnt, zum n. Mal“ | so viele Tage, wie der Server in `verwarnungTage` einstellt, 30 bis 730, Standard 365, siehe [API der Managed Commands](../schnittstelle/strafen.md); der Bot löscht ältere Zeilen mindestens stündlich, auch nachdem die Frist kürzer geworden ist, und wenn er den Server verlässt | gebaut |
| Bindung eines Kaufs: Server-ID, SKU-ID, Entitlement-ID, ob verbraucht, Zeit; keine Discord-ID einer Person | dass ein bezahltes Modul auf dem Server freigeschaltet ist, siehe [0020](../entscheidungen/0020-bezahlte-module.md) | bis Discord das Entitlement löscht, etwa bei einer Rückerstattung; bleibt, wenn der Bot den Server verlässt, damit der Kauf nicht verloren geht | gebaut |
| Board je Server und Modul: Server-ID, ID des Moduls, Schalter | welche Module auf dem Server an sind, siehe [Board der Module](../schnittstelle/module.md) | bis das Team es ändert oder der Bot den Server verlässt | gebaut |

Mit den Sprachräumen hält discord.js zudem für jedes Mitglied, das einen
Sprachkanal betreten hat, einen Voice State mit Discord-ID, Kanal und
Session im Speicher. Verlässt es den Sprachkanal, bliebe der Eintrag bis
zum Ende des Prozesses. Darum entfernt ein Sweeper alle 10 Minuten jeden
Voice State ohne Kanal (`sweepers` in `erstelleClient`, `bot/src/discord/client.ts`).

Für die Grenze von 30 s je neuem Raum merkt sich der Bot je Server und
Mitglied die Zeit des letzten neuen Raums im Speicher, mit der Discord-ID.
Ein Timer vergisst den Eintrag nach 30 s (`Raeume`, `bot/src/module/sprachraeume/raeume.ts`),
siehe [Sprachräume](../benutzung/sprachraeume.md), „Grenzen“. Der Test „die
Grenze von 30 s vergisst ein Mitglied nach ihrer Zeit“ prüft das.

Für die Abos hält der Bot je Server die Entitlements von Discord höchstens
10 min im Speicher (`Freischaltung` in `bot/src/brett/freischaltung.ts`).
Ein Entitlement trägt die Discord-ID der Person, die gekauft hat
(`user_id`,
[Entitlement Object](https://docs.discord.com/developers/resources/entitlement#entitlement-object));
der Bot liest daraus nur ID, SKU, `guild_id`, `consumed`, `deleted` und
`ends_at` (`Kauf` in `bot/src/discord/kaeufe.ts`), die `user_id` nie. Beim
Binden eines Kaufs liest er die Entitlements der angemeldeten Person
einmal und speichert nur das eine, das er bindet. Nach jeder neuen Sitzung
eines Shards liest er alle Käufe der gebundenen SKUs, auch gelöschte und
mit `user_id`, nur für diesen Durchgang. Er behält keine `user_id` und
speichert nur Änderungen an den Bindungen, siehe
[Board der Module](../schnittstelle/module.md), „Kauf binden“, und
[0020](../entscheidungen/0020-bezahlte-module.md).

discord.js legte jedes Entitlement, das es sieht, mit `user_id` im Cache
der Anwendung ab, auch die, die jede Interaktion mitbringt. Darum hält
`erstelleClient` dort keins (`EntitlementManager` mit `maxSize` 0), und
der Bot liest Käufe über die REST-API, nicht über
`client.application.entitlements`. Der Test „Ereignisse kommen als Kauf,
ohne Discord-ID der Person; der Cache der Anwendung bleibt leer“ prüft
das.

Für die Debug-Seite hält der Bot die Discord-IDs des Eigentümers der
Anwendung oder der Mitglieder ihres Teams mit angenommener Einladung im
Speicher, einmal je Prozess und höchstens 5 min (`Berechtigte` in
`bot/src/discord/eigentuemer.ts`), siehe
[API der Debug-Seite](../schnittstelle/debug.md), „Wer sie sehen darf“.
Ausserdem legt discord.js beim Abruf Eigentümer oder Team mit Namen in
`client.application.owner` ab; das bleibt bis zum nächsten Abruf oder zum
Ende des Prozesses. Der Test „die Liste der Berechtigten gilt 5 min,
einmal für alle“ prüft die 5 min.

„Der Bot verlässt den Server“ heisst auch: Er wurde entfernt, während er
aus war. Beim Start gleicht er ab und löscht dann, siehe
[Begrüssung bei Beitritt und Abschied](../benutzung/begruessung.md),
„Wenn etwas fehlt“.

Die Zählung der Anfragen an Discord hält nur Methoden, Routen ohne IDs
und Tokens, Zahlen und Zeiten, nichts über Personen, und nur im Speicher,
siehe [Rate-Limits](rate-limits.md), „Zählen“.

Nicht gespeichert werden:

- Der Access Token von Discord. Der Bot widerruft ihn gleich nach der
  Anmeldung, siehe [Anmeldung am Dashboard](../schnittstelle/anmeldung.md),
  „Ablauf“.
- Name und Avatar eines Mitglieds, das beitritt oder geht. Sie kommen in
  keine Tabelle. Den Avatar lädt der Bot für das Banner vom CDN von Discord
  und vergisst ihn danach; Namen hält nur der begrenzte Cache unten.

Welche Tabelle was hält, steht in [Datenbank](datenbank.md), „Tabellen“.
Der Cache von discord.js und der eigene Cache
(`bot/src/kern/cache.ts`) liegen nur im Speicher und enden mit dem Prozess.

discord.js legt jedes Mitglied, das es sieht, mit Spitzname und Rollen im
Cache der Mitglieder ab und dessen Nutzer mit Name und Avatar im Cache der
Nutzer (`GuildMember#_patch`): bei jeder Interaktion, bei jeder Prüfung der
Rechte und mit dem Intent `GuildMembers` bei jedem Beitritt. Ohne Grenze
blieben sie bis zum Ende des Prozesses. Darum hält `erstelleClient` in
`bot/src/discord/client.ts` in beiden Caches, `GuildMemberManager` und
`UserManager`, nur den Bot selbst (`maxSize` 0, `keepOverLimit`). Der Test
„der Cache hält Mitglieder und Nutzer nur für den Bot selbst“ prüft das.
Die Rechte prüft der Bot ohnehin an der REST-API, nicht im Cache, siehe
[Anmeldung am Dashboard](../schnittstelle/anmeldung.md), „Rechte“.

## Was ins Log geht

Nur der Name des Befehls und der Text eines Fehlers (`text` in
`bot/src/kern/fehler.ts`), nie das Fehlerobjekt: Fehler der REST-API
tragen in `url` den Token der Interaktion. Nie IDs, Namen, Nachrichteninhalte,
Tokens, Cookies oder der Code der Anmeldung. Der Test „ein unbekannter
Befehl bekommt eine Meldung, das Log keine Nutzerdaten“ prüft die Zeile,
„scheitert die Antwort, wirft antworte DiscordFehler …“, dass weder Token
noch ID darin stehen.

Die API loggt nur den Schritt der Anmeldung oder den Namen der Route
und den Text des Fehlers: `Anmeldung: <Schritt>: <Fehler>` und
`API <Route>: <Fehler>`. Der Name der Route ist fest, etwa `seiten`, nie
der Pfad; der trägt die ID des Servers. Der Test „kein Code, Token, Cookie,
state und keine ID im Log“ prüft das.

Die Käufe loggen nur einen festen Schritt und den Text des Fehlers, etwa
`Kauf binden: <Fehler>`, und beim Abgleich und Nachverbrauchen nur Zahlen,
etwa `Käufe abgeglichen: 3 Bindungen, 1 gelöscht, 1 nachverbraucht, 1
offen.`; nie Entitlement-, Nutzer- oder Server-IDs. Die Tests „scheitert
das Verbrauchen, ist das Modul trotzdem frei …“ und „ein gelöschter Kauf
entfernt die Bindung …“ prüfen die Zeilen.

Die Managed Commands loggen nur den Befehl und den Text eines Fehlers,
etwa `/ban: DM nicht gesendet: <Fehler>` oder `strafen: nicht
aufgeräumt: <Fehler>`; nie Ziel, Grund oder wer den Befehl nutzt.

Die Sprachräume loggen nur einen festen Schritt und den Text des Fehlers,
etwa `Sprachraum: nicht angelegt: <Fehler>`; das Menü nur
`Sprachraum-Menü: <Fehler>`. Auch dort nie das Fehlerobjekt, also nie den
Token der Interaktion. Die Tests „fehlt dem Bot ein Recht (50013), sagt er
es …“ und „ein anderer Fehler …“ prüfen, dass keine ID und kein Token in
der Zeile steht.

Die Zählung der Rate-Limits loggt nur `Rate-Limit: …` mit Methode, Route,
Scope, `global` und Zahlen, siehe [Rate-Limits](rate-limits.md), „Zählen“.
Die Route rechnet der Bot selbst, ohne IDs und Tokens; `url`, Pfad und
`majorParameter` von `@discordjs/rest` kommen nie ins Log, denn sie tragen
IDs und bei Webhooks und Interaktionen den Token. Ein Fehler der Anmeldung
nennt nur Schritt und Status. Er trägt auch keine `cause`: Fehler von
`@discordjs/rest` halten in `requestBody` den Code oder den Token. Die
Tests „ein 429 mit Headern gibt genau eine Logzeile ohne ID und Token …“,
„Tokens von Interaktionen und Webhooks stehen weder im Stand noch im Log
…“ und „verlangt Discord länger als die Frist, scheitert die Anmeldung
gleich …“ prüfen das.

Fehler der Datenbank gehen ebenso nur mit ihrer Meldung ins Log, auch
`Datenbank: <Meldung>` aus dem Pool, siehe [Datenbank](datenbank.md),
„Pool“. PostgreSQL legt die Werte einer Zeile, etwa bei einem doppelten
Schlüssel, in `detail` ab, nicht in die Meldung; `detail` geht nie ins
Log. Eine falsche Eingabe kann die Meldung aber nennen, etwa
`invalid input syntax for type bigint: "…"`. Eingaben von Nutzern darum
prüfen, bevor sie in eine Anfrage gehen.
