---
title: Sprachräume
description: Eigene Sprachkanäle auf Zeit; wer einen Erzeuger betritt, bekommt einen Raum, steuert ihn mit Knöpfen im Textchat des Raums, und der Raum verschwindet, wenn er leer ist. Ablauf, Namensvorlage, Menü und Knöpfe, Grenzen, Rechte und Intent.
code:
  - bot/src/index.ts
---

# Sprachräume

Wer einen Erzeuger betritt, einen Sprachkanal wie „➕ Talk“, bekommt einen
eigenen Sprachkanal, den Raum, und wird hineinverschoben. Gesteuert wird
der Raum mit Knöpfen in einem Menü, das der Bot in den Textchat des Raums
postet, ohne Befehle. Ist der Raum leer, löscht der Bot ihn, und das Menü
verschwindet mit ihm. Welche Erzeuger es gibt, stellt das Team im
Dashboard ein, siehe
[API der Sprachräume](../schnittstelle/sprachraeume.md), „Sprachräume einstellen“.
Warum es so gebaut ist, steht in Entscheidung
[0011](../entscheidungen/0011-sprachraeume-mit-knoepfen.md).

## Ablauf

1. Jemand betritt einen Erzeuger.
2. Besitzt er schon einen Raum auf diesem Server, verschiebt der Bot ihn
   dorthin. Sonst legt der Bot einen neuen Raum an: in der Kategorie des
   Erzeugers oder der eingestellten, mit dem Namen aus der Vorlage und dem
   eingestellten Limit, und verschiebt ihn hinein. Er ist der Besitzer.
   Danach postet der Bot das Menü in den Textchat des neuen Raums.
3. Verlässt er den Erzeuger, bevor das Verschieben klappt, löscht der Bot
   den neuen Raum sofort wieder.
4. Wird ein Raum leer, wartet der Bot 2 s und löscht ihn, wenn er dann noch
   leer ist. So überholt das Löschen kein Verschieben, das gerade läuft.
5. Verlässt der Besitzer den Raum, während andere drin bleiben, bleibt er
   Besitzer, bis jemand im Raum „Übernehmen“ drückt.

Jedes Mitglied besitzt höchstens einen Raum je Server. Darum ist das Ziel
in Schritt 2 immer eindeutig, und „Besitz übergeben“ und „Übernehmen“
gehen nicht an jemanden, der schon einen Raum hat.

Die Rechte eines neuen Raums kommen von seiner Kategorie. Dazu bekommen
der Besitzer und der Bot das Recht, den Raum zu sehen und zu betreten,
damit Sperren und Verstecken sie nicht aussperren; der Bot ausserdem das
Recht, im Textchat des Raums zu schreiben, für das Menü.

## Namensvorlage

| Platzhalter | wird zu |
|---|---|
| `{name}` | Anzeigename des Besitzers auf dem Server, unmaskiert; Kanalnamen kennen kein Markdown |

- Standard: `{name}s Raum`.
- Ein Kanalname hat 1 bis 100 Zeichen
  ([Channel Object](https://docs.discord.com/developers/resources/channel)).
  Das Dashboard nimmt nur Vorlagen an, die mit dem längsten Anzeigenamen
  höchstens 100 Zeichen ergeben, siehe
  [API der Sprachräume](../schnittstelle/sprachraeume.md), „Sprachräume
  einstellen“. Länger wird ein Name also nie.
- Andere Wörter in geschweiften Klammern bleiben, wie sie sind.

## Menü

Jeder Sprachkanal hat bei Discord einen eigenen Textchat; ein Bot schreibt
dort wie in einem Textkanal
([`VoiceChannel#send`](https://discord.js.org/docs/packages/discord.js/14.27.0/VoiceChannel:Class#send)).
Gleich nach dem Anlegen postet der Bot in den Textchat des Raums eine
Nachricht mit der Überschrift „Dein Sprachraum“, einem kurzen Text und den
Knöpfen unten. Ein Knopf wirkt immer auf den Raum, in dessen Chat er
steht. Jede Antwort des Bots sieht nur, wer gedrückt hat. Umbenennen und
Limit öffnen ein Formular, Rauswerfen, Bannen, Entbannen und Besitz
übergeben die Nutzerauswahl von Discord
([Component Reference](https://docs.discord.com/developers/components/reference)).
Das Menü wirkt auch nach einem Neustart des Bots weiter und verschwindet
mit dem Raum.

| Knopf | Wer darf | Was passiert |
|---|---|---|
| Sperren | Besitzer | Niemand Neues kann beitreten. Wer gerade drin ist, bekommt ein eigenes Recht, den Raum zu betreten, und kommt auch nach dem Gehen wieder hinein. |
| Entsperren | Besitzer | Wieder offen für alle, die die Kategorie betreten dürfen. |
| Verstecken | Besitzer | Andere sehen den Raum nicht mehr. Wer gerade drin ist, bekommt ein eigenes Recht, ihn zu sehen und zu betreten, und bleibt. |
| Zeigen | Besitzer | Wieder sichtbar für alle, die die Kategorie sehen. |
| Umbenennen | Besitzer | Formular mit dem neuen Namen, 1 bis 100 Zeichen, ohne Platzhalter. |
| Limit | Besitzer | Formular mit einer Zahl von 0 bis 99; 0 heisst unbegrenzt ([Channel Object](https://docs.discord.com/developers/resources/channel)). |
| Rauswerfen | Besitzer | Auswahl eines Mitglieds. Ist es im Raum, wird es getrennt und darf wieder beitreten. |
| Bannen | Besitzer | Auswahl eines Mitglieds. Es kann den Raum weder sehen noch betreten; ist es drin, wird es getrennt. |
| Entbannen | Besitzer | Auswahl eines Mitglieds. Ist es gebannt, ist der Bann aufgehoben. |
| Besitz übergeben | Besitzer | Auswahl eines Mitglieds im Raum, das keinen eigenen Raum hat. Es wird Besitzer. |
| Übernehmen | jedes Mitglied im Raum ohne eigenen Raum, wenn der Besitzer nicht drin ist | Es wird Besitzer. |
| Info | jeder, der den Chat sieht | Besitzer, Limit, ob gesperrt oder versteckt, Zahl der Gebannten. |

- Den Chat eines Raums sieht, wer den Raum sehen darf, auch ohne drin zu
  sein. Darum prüft der Bot bei „Übernehmen“, ob man im Raum ist.
- Die Nutzerauswahl von Discord zeigt alle Mitglieder des Servers. Ob das
  gewählte Mitglied im Raum ist oder gebannt, prüft der Bot danach und sagt
  es, wenn nicht.
- Wer nicht Besitzer ist, bekommt den Hinweis, dass nur der Besitzer das
  darf, und wer es gerade ist.
- Sich selbst und den Bot kann man nicht rauswerfen, bannen oder zum
  Besitzer machen.
- Ob ein Raum gesperrt oder versteckt ist und wer gebannt ist, steht in den
  Rechten des Kanals bei Discord, nicht in der Datenbank. Ändert jemand die
  Rechte von Hand, gilt das.
- Einen Kanal lässt Discord nur wenige Male in kurzer Zeit umbenennen;
  `@discordjs/rest` rechnet mit 2 Umbenennungen je 10 Minuten und Kanal
  (`hasSublimit` für `PATCH /channels/:id` mit `name`). Ist die Grenze
  erreicht, wartet der Bot nicht, sondern nennt die Wartezeit, siehe
  [Rate-Limits](../bot/rate-limits.md).

## Grenzen

- Jedes Mitglied besitzt höchstens einen Raum je Server, siehe „Ablauf“.
- Ein Mitglied bekommt höchstens einen neuen Raum je 30 s. Betritt es
  früher wieder einen Erzeuger, bleibt es dort, und der Bot legt nichts
  an. So kostet Hin- und Herspringen Discord nichts. Diese Grenze lebt im
  Speicher; ein Neustart setzt sie zurück.
- Ein Server hat höchstens 10 Erzeuger.
- Ist die Kategorie voll (höchstens 50 Kanäle,
  [Channel Object](https://docs.discord.com/developers/resources/channel))
  oder der Server (Fehler 30013), legt der Bot keinen Raum an. Hat ein Raum
  so viele Rechte-Einträge, dass Discord keinen weiteren nimmt (Fehler
  30060), geht kein weiterer Bann
  ([JSON Error Codes](https://docs.discord.com/developers/topics/opcodes-and-status-codes#json-json-error-codes)).

## Rechte und Intent

Die Rechte braucht der Bot auf dem ganzen Server, nicht nur in den
Kategorien der Räume. Beim Anlegen eines Kanals darf er nur Rechte setzen,
die er auf dem Server hat
([Create Guild Channel](https://docs.discord.com/developers/resources/guild#create-guild-channel)).

| Was | Wofür |
|---|---|
| Intent `GuildVoiceStates` | Discord meldet Betreten und Verlassen von Sprachkanälen nur damit; er ist nicht privilegiert, siehe [Intents](../bot/intents.md) |
| „Kanäle verwalten“ | Räume anlegen, umbenennen, Limit setzen, löschen |
| „Rollen verwalten“ | Rechte eines Raums setzen: Sperren, Verstecken, Bannen, Besitzer und Bot beim Anlegen. Discord verlangt dafür dieses Recht, und der Bot kann nur Rechte vergeben, die er selbst hat ([Edit Channel Permissions](https://docs.discord.com/developers/resources/channel#edit-channel-permissions)) |
| „Mitglieder verschieben“ | in den neuen Raum verschieben, zurück in den eigenen Raum, rauswerfen ([Modify Guild Member](https://docs.discord.com/developers/resources/guild#modify-guild-member)) |
| „Kanal ansehen“, „Verbinden“ | in Erzeugern und Räumen; verschieben darf der Bot nur in einen Kanal, den er selbst betreten darf (ebenda) |
| „Nachrichten senden“ | das Menü im Textchat jedes Raums; der Bot gibt sich das Recht dort beim Anlegen selbst, damit eine Kategorie es ihm nicht nimmt |

Ins Audit-Log von Discord schreibt der Bot als Grund nur feste Texte, ohne
IDs und Namen.

## Wenn etwas fehlt

- Fehlt dem Bot ein Recht oder ist die Kategorie voll, legt er keinen Raum
  an; das Mitglied bleibt im Erzeuger. Ins Log kommt eine Zeile ohne IDs
  und Namen.
- Scheitert das Menü im Textchat, bleibt der Raum trotzdem, nur ohne
  Knöpfe. Ins Log kommt eine Zeile ohne IDs und Namen.
- Wird ein Raum von Hand gelöscht, vergisst der Bot ihn.
- Beim Start vergisst der Bot Räume, die es nicht mehr gibt, und löscht
  Räume, die leer sind.
- Gibt es einen Erzeuger nicht mehr, wirkt er nicht; das Dashboard zeigt
  ihn als unbekannt.
- Verlässt der Bot einen Server, löscht er dessen Einstellungen und vergisst
  dessen Räume. Die Räume selbst bleiben dann bei Discord stehen; das ist
  so gewollt, der Bot hat dort keine Rechte mehr.

## Was noch fehlt

- Kategorie wechseln: einen Raum in eine andere Kategorie der Erzeuger
  schieben.
- Weitere Einstellungen eines Raums, etwa Bitrate oder Region.
