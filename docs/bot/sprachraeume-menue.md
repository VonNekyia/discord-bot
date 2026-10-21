---
title: Menü der Sprachräume im Bot
description: Wie der Bot das Menü im Textchat jedes Raums baut; Module, Knöpfe und custom_id, Antworten mit deferReply, eins nach dem anderen je Raum, Rechte im Raum für Sperren, Verstecken und Bann, Besitzer wechseln, erwartete Fehler, Audit-Log und Log.
code:
  - bot/src/module/sprachraeume/knoepfe.ts
  - bot/src/module/sprachraeume/menue.ts
  - bot/src/module/sprachraeume/raumrechte.ts
  - bot/src/discord/menue.ts
  - bot/src/discord/rechte.ts
  - bot/src/discord/interaktionen.ts
  - bot/src/discord/sprachkanaele.ts
  - bot/src/index.ts
  - bot/src/module/sprachraeume/modul.ts
  - bot/src/discord/modul.ts
---

# Menü der Sprachräume im Bot

Was die Knöpfe tun und wer sie drücken darf, steht in
[Sprachräume](../benutzung/sprachraeume.md), „Menü“. Diese Seite sagt, wie
das Backend das Menü baut, und hält die Regeln fest, die der Code nicht
brechen darf. Wie Räume entstehen und gehen, steht in
[Sprachräume im Bot](sprachraeume-bau.md).

## Module

| Datei | Inhalt |
|---|---|
| `bot/src/module/sprachraeume/menue.ts` | `menue`, `auswahl`, `formular` mit eigenen Typen; das Präfix |
| `bot/src/discord/menue.ts` | die Discord-Schicht baut daraus Components: `alsNachricht`, `alsAuswahl`, `alsModal` |
| `bot/src/module/sprachraeume/knoepfe.ts` | `Knoepfe#bediene(druck)`: Prüfungen und Antworten, ohne discord.js |
| `bot/src/discord/interaktionen.ts` | `Druck` und `alsDruck`: Knopf, Auswahl oder Formular mit eigenen Typen; `antworte`, `zeigeAuswahl`, `zeigeFormular`, `warte`, `fertig` |
| `bot/src/discord/sprachkanaele.ts` | `sprachraum(server, kanal)`: Name, Limit und Einträge aus dem Cache, `setzeRechte`, `benenne`, `setzeLimit`; dazu `belegung` und `verschiebe` |
| `bot/src/module/sprachraeume/raumrechte.ts` | Sperren, Verstecken, Bann und neuer Besitzer als reine Rechnung auf den Rechte-Einträgen (`Eintrag` mit `art`, `Recht` aus `bot/src/discord/rechte.ts`) |

`Raeume` postet das Menü nach dem Anlegen, siehe
[Sprachräume im Bot](sprachraeume-bau.md), „Anlegen“. `haengeAn` in
`bot/src/discord/modul.ts` macht bei `interactionCreate` mit `alsDruck` und
dem Präfix aus `knoepfe` des Moduls (`bot/src/module/sprachraeume/modul.ts`)
aus jeder passenden Interaktion einen `Druck` und gibt ihn an
`Knoepfe#bediene`.

## Knöpfe

- Jeder Knopf hat die `custom_id` `sprachraum:<aktion>`, etwa
  `sprachraum:sperren`. Die Nutzerauswahl und das Formular, die ein Knopf
  öffnet, tragen dieselbe `custom_id`; `bediene` unterscheidet sie an der
  Art der Interaktion.
- Kein Collector: Der Bot erkennt das Menü nur am Präfix, auch nach einem
  Neustart. Die Nachricht muss er sich nicht merken.
- Den Raum liest der Bot aus `Druck#kanal` (`interaction.channelId`), den
  Besitzer aus der Tabelle `raeume`. Ist der Kanal kein Raum, sagt er das.
- Drei Action Rows mit je vier Knöpfen: Zugang (Sperren, Entsperren,
  Verstecken, Zeigen), Raum (Umbenennen, Limit, Übernehmen, Info),
  Mitglieder (Rauswerfen, Bannen, Entbannen, Besitz übergeben). Rauswerfen
  und Bannen sind rot (`Danger`), die anderen grau (`Secondary`).
- Vor dem Text trägt jeder Knopf ein Unicode-Emoji: `emoji` in `Knopf`
  aus `bot/src/discord/menue.ts`, gesetzt mit `setEmoji` in `alsNachricht`.
  Es steht so da, wie Discord es führt; bei 👁️, ✏️, ℹ️ und 🕊️ gehört
  U+FE0F dazu. Im Payload ist es `emoji` mit `name` und ohne `id`
  ([Component Reference](https://docs.discord.com/developers/components/reference#button)).
  Welches Emoji zu welchem Knopf gehört, steht in `reihen` in
  `bot/src/module/sprachraeume/menue.ts` und in der Tabelle in
  [Sprachräume](../benutzung/sprachraeume.md), „Menü“.
- Die Formulare haben ein Label (Typ 18) mit einem Textfeld `wert`,
  vorbelegt mit dem Namen oder dem Limit von jetzt
  ([Component Reference](https://docs.discord.com/developers/components/reference#label)).
  Der Name hat 1 bis 100 Zeichen, das Limit 1 bis 2; Discord prüft die
  Länge, der Bot danach Leerzeichen und Ziffern.

## Antworten

- Jede Antwort ist ephemeral, und Erwähnungen pingen nicht
  (`allowed_mentions` leer).
- Discord wartet höchstens 3 s auf die erste Antwort
  ([Receiving and Responding](https://docs.discord.com/developers/interactions/receiving-and-responding#responding-to-an-interaction)).
  Vor jedem Aufruf an Discord ruft der Bot darum `Druck#warte`, also
  `deferReply` ephemeral, bei der Nutzerauswahl `deferUpdate`; danach setzt
  `Druck#fertig` mit `editReply` die Antwort. Bei der Nutzerauswahl ersetzt sie die Auswahl, deren Knöpfe gehen
  weg. Der Test „Sperren: deferReply vor dem PATCH …“ prüft die
  Reihenfolge.
- Ein Formular muss die erste Antwort sein (`showModal`). Knöpfe, die ein
  Formular oder die Nutzerauswahl öffnen, lesen darum vorher nur die
  Tabelle und antworten dann gleich.
- Formular und Auswahl bekommt nur der Besitzer. Beim Absenden prüft der
  Bot noch einmal, denn der Besitz kann inzwischen gewechselt haben.

## Eins nach dem anderen je Raum

Was die Knöpfe eines Raums auslösen, läuft der Reihe nach (`nacheinander`
je Kanal). Der Bot rechnet die neuen Rechte aus dem Cache; zwei schnelle
Klicks sollen nicht vom selben alten Stand ausgehen.
`Sprachraum#setzeRechte` schickt mit `permissionOverwrites.set` ein
`PATCH /channels/{id}`, und discord.js legt dessen Antwort sofort in den
Cache
(`GuildChannelManager#edit`). Ein `PUT` auf einen einzelnen Eintrag täte
das nicht; der Cache wüsste erst nach `CHANNEL_UPDATE` vom Gateway davon.

## Rechte im Raum

Gesperrt, versteckt und gebannt stehen nur in den Rechte-Einträgen des
Kanals, siehe Entscheidung
[0011](../entscheidungen/0011-sprachraeume-mit-knoepfen.md).
`bot/src/module/sprachraeume/raumrechte.ts` rechnet aus den Einträgen des Raums und denen seiner
Kategorie die neue Liste, und der Bot schickt sie in einem `PATCH`
(`Sprachraum#setzeRechte`). Ohne `name` gilt das Sublimit dafür nicht,
siehe [Rate-Limits](rate-limits.md), „Kanäle ändern“.

Discord wendet erst @everyone an, dann die Rollen, dann die Einträge für
Personen; auf jeder Stufe geht erlaubt vor verboten
([Permission Overwrites](https://docs.discord.com/developers/topics/permissions#permission-overwrites)).
Darum gilt:

| Zustand | gilt, wenn | Sperren, Verstecken, Bannen | Entsperren, Zeigen, Entbannen |
|---|---|---|---|
| gesperrt | @everyone verbietet „Verbinden“, und keine Rolle erlaubt es | @everyone und jede Rolle mit Eintrag: „Verbinden“ verboten; wer drin ist, bekommt einen eigenen Eintrag mit „Verbinden“; Einträge anderer Personen bleiben, auch der eines früheren Besitzers | jede Rolle und jede Person mit eigenem „Verbinden“, auch ein früherer Besitzer: „Verbinden“ wie in der Kategorie; nur Besitzer, Bot und Gebannte bleiben, wie sie sind |
| versteckt | @everyone verbietet „Kanal ansehen“, und keine Rolle erlaubt es | ebenso mit „Kanal ansehen“; wer drin ist, bekommt „Kanal ansehen“ und „Verbinden“ | ebenso mit „Kanal ansehen“, auch für einen früheren Besitzer; ist der Raum nicht gesperrt, auch „Verbinden“, sonst behält jeder sein eigenes „Verbinden“ |
| gebannt | der Eintrag einer Person verbietet „Kanal ansehen“ und „Verbinden“, der Eintrag der Kategorie für sie nicht | beides verboten, eigenes Erlaubtes weg | beides wie in der Kategorie |

- „Wie in der Kategorie“ heisst: wie der Eintrag derselben ID in der
  Kategorie von jetzt, ohne Eintrag dort neutral.
- Besitzer und Bot behalten ihre Einträge aus dem Anlegen; Erlaubtes für
  Personen geht Verboten für Rollen vor.
- Gebannte bekommen beim Sperren und Verstecken nichts, und Entsperren und
  Zeigen lassen sie gebannt.
- Leere Einträge fallen weg. Sie wirken nicht, zählen aber zur Grenze von
  Discord (30060).
- Wer trotzdem hineinkommt, steht in
  [Sprachräume](../benutzung/sprachraeume.md), „Menü“.

## Besitzer wechseln

„Besitz übergeben“ und „Übernehmen“ ändern die Zeile in `raeume` mit
`UPDATE … WHERE kanal = $2 AND besitzer = $3`. Ändert das keine Zeile, hat
inzwischen jemand anderes den Raum. Hat der neue Besitzer schon einen Raum,
weist `UNIQUE (server, besitzer)` das ab (23505), auch bei zwei
gleichzeitigen Wechseln; der Bot prüft das nicht vorher selbst. Danach
bekommt der neue Besitzer dieselben Rechte wie der erste (`mitBesitzer`).
Der alte behält seinen Eintrag, bis Entsperren oder Zeigen ihn wie oben auf
die Kategorie setzt. Einen Bot nimmt „Besitz übergeben“ nicht, auch keinen
fremden (`bot` aus der Nutzerauswahl); bliebe er im Raum, ginge
„Übernehmen“ nicht mehr.
Scheitern die Rechte, gilt der Besitz trotzdem, und ins Log kommt eine
Zeile.

## Erwartete Fehler

Die Knöpfe lesen den Code von `DiscordFehler`, siehe
[Struktur von Bot und Oberfläche](../entwicklung/struktur.md), „Die Discord-Schicht“.

| Code | Wann | Was der Bot tut |
|---|---|---|
| `zu_schnell` (RateLimitError) | Discord lässt `PATCH /channels/{id}` gerade nicht zu, vor allem beim Umbenennen | die Wartezeit aus `warten` nennen, ohne Logzeile |
| `zu_viele_eintraege` (30060) | der Raum hat so viele Rechte-Einträge, dass Discord keinen weiteren nimmt | Hinweis, ohne Logzeile |
| `nicht_verbunden` (40032) | wer rausgeworfen oder gebannt wird, ist nicht mehr verbunden | beim Rauswerfen „nicht im Raum“, beim Bannen nichts |
| `nicht_gefunden` (10003) | der Kanal ist schon weg | „kein Sprachraum mehr“ |
| `kein_recht` (50001, 50013) | dem Bot fehlt ein Recht | Hinweis an den Nutzer, eine Logzeile |

Jeder andere Fehler gibt „Das hat nicht geklappt.“ und eine Logzeile.
Belege: [JSON Error Codes](https://docs.discord.com/developers/topics/opcodes-and-status-codes#json-json-error-codes).

## Audit-Log und Log

Ins Audit-Log schreibt der Bot nur feste Gründe, etwa
`Sprachraum: gesperrt` oder `Sprachraum: Besitz übergeben` (`grund` in
`bot/src/module/sprachraeume/knoepfe.ts`). Ins Log kommt nur `Sprachraum-Menü: <Fehler>`, siehe
[Datenschutz](datenschutz.md), „Was ins Log geht“.
