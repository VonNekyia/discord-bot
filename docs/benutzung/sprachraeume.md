---
title: Sprachräume
description: Eigene Sprachkanäle auf Zeit; wer einen Erzeuger betritt, bekommt einen Raum, steuert ihn mit Knöpfen im Menü, und der Raum verschwindet, wenn er leer ist. Ablauf, Namensvorlage, Menü und Knöpfe, Grenzen, Rechte und Intent.
code:
  - bot/src/index.ts
---

# Sprachräume

Wer einen Erzeuger betritt, einen Sprachkanal wie „➕ Talk“, bekommt einen
eigenen Sprachkanal, den Raum, und wird hineinverschoben. Gesteuert wird
der Raum mit Knöpfen in einem Menü, das der Bot in einen Textkanal postet,
ohne Befehle. Ist der Raum leer, löscht der Bot ihn. Welche Erzeuger es
gibt und wo das Menü steht, stellt das Team im Dashboard ein, siehe
[API der Sprachräume](../schnittstelle/sprachraeume.md), „Sprachräume einstellen“.
Warum es so gebaut ist, steht in Entscheidung
[0011](../entscheidungen/0011-sprachraeume-mit-knoepfen.md).

## Ablauf

1. Jemand betritt einen Erzeuger.
2. Besitzt er schon einen Raum auf diesem Server, verschiebt der Bot ihn
   dorthin. Sonst legt der Bot einen neuen Raum an: in der Kategorie des
   Erzeugers oder der eingestellten, mit dem Namen aus der Vorlage und dem
   eingestellten Limit, und verschiebt ihn hinein. Er ist der Besitzer.
3. Verlässt er den Erzeuger, bevor das Verschieben klappt, löscht der Bot
   den neuen Raum sofort wieder.
4. Wird ein Raum leer, löscht der Bot ihn.
5. Verlässt der Besitzer den Raum, während andere drin bleiben, bleibt er
   Besitzer, bis jemand im Raum „Übernehmen“ drückt.

Die Rechte eines neuen Raums kommen von seiner Kategorie. Dazu bekommen
der Besitzer und der Bot das Recht, den Raum zu sehen und zu betreten,
damit Sperren und Verstecken sie nicht aussperren.

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

Der Bot postet in den eingestellten Textkanal eine Nachricht mit der
Überschrift „Dein Sprachraum“, einem kurzen Text und den Knöpfen unten.
Ein Knopf wirkt immer auf den Raum, in dem man gerade ist. Jede Antwort
des Bots sieht nur, wer gedrückt hat. Umbenennen und Limit öffnen ein
Formular, Rauswerfen, Bannen, Entbannen und Besitz übergeben eine Auswahl
von Mitgliedern
([Component Reference](https://docs.discord.com/developers/components/reference)).

| Knopf | Wer darf | Was passiert |
|---|---|---|
| Sperren | Besitzer | Niemand Neues kann beitreten. Wer drin ist, bleibt. |
| Entsperren | Besitzer | Wieder offen. |
| Verstecken | Besitzer | Andere sehen den Raum nicht mehr. Wer drin ist, sieht ihn weiter. |
| Zeigen | Besitzer | Wieder sichtbar. |
| Umbenennen | Besitzer | Formular mit dem neuen Namen, 1 bis 100 Zeichen, ohne Platzhalter. |
| Limit | Besitzer | Formular mit einer Zahl von 0 bis 99; 0 heisst unbegrenzt ([Channel Object](https://docs.discord.com/developers/resources/channel)). |
| Rauswerfen | Besitzer | Auswahl eines Mitglieds im Raum. Es wird getrennt und darf wieder beitreten. |
| Bannen | Besitzer | Auswahl eines Mitglieds. Es kann den Raum weder sehen noch betreten; ist es drin, wird es getrennt. |
| Entbannen | Besitzer | Auswahl eines gebannten Mitglieds. Der Bann ist aufgehoben. |
| Besitz übergeben | Besitzer | Auswahl eines Mitglieds im Raum. Es wird Besitzer. |
| Übernehmen | jedes Mitglied im Raum, wenn der Besitzer nicht drin ist | Es wird Besitzer. |
| Info | jedes Mitglied im Raum | Besitzer, Limit, ob gesperrt oder versteckt, Zahl der Gebannten. |

- Wer in keinem Raum ist, bekommt den Hinweis, zuerst einen Erzeuger zu
  betreten.
- Wer nicht Besitzer ist, bekommt den Hinweis, dass nur der Besitzer das
  darf, und wer es gerade ist.
- Sich selbst und den Bot kann man nicht rauswerfen, bannen oder zum
  Besitzer machen.
- Ob ein Raum gesperrt oder versteckt ist und wer gebannt ist, steht in den
  Rechten des Kanals bei Discord, nicht in der Datenbank. Ändert jemand die
  Rechte von Hand, gilt das.
- Antwortet Discord beim Umbenennen mit 429, nennt der Bot die Wartezeit.

## Grenzen

- Ein Mitglied bekommt höchstens einen neuen Raum je 30 s. Betritt es
  früher wieder einen Erzeuger, bleibt es dort, und der Bot legt nichts
  an. So kostet Hin- und Herspringen Discord nichts.
- Ein Server hat höchstens 10 Erzeuger.
- Ist die Kategorie voll (höchstens 50 Kanäle,
  [Channel Object](https://docs.discord.com/developers/resources/channel)),
  legt der Bot keinen Raum an.

## Rechte und Intent

| Was | Wofür |
|---|---|
| Intent `GuildVoiceStates` | Discord meldet Betreten und Verlassen von Sprachkanälen nur damit; er ist nicht privilegiert, siehe [Intents](../bot/intents.md) |
| „Kanäle verwalten“ | Räume anlegen, umbenennen, Limit setzen, löschen |
| „Rollen verwalten“ | Rechte eines Raums setzen: Sperren, Verstecken, Bannen. Discord verlangt dafür dieses Recht, und der Bot kann nur Rechte vergeben, die er selbst hat ([Edit Channel Permissions](https://docs.discord.com/developers/resources/channel#edit-channel-permissions)) |
| „Mitglieder verschieben“ | in den neuen Raum verschieben, rauswerfen ([Modify Guild Member](https://docs.discord.com/developers/resources/guild#modify-guild-member)) |
| „Kanal ansehen“, „Verbinden“ | in Erzeugern und Räumen; verschieben darf der Bot nur in einen Kanal, den er selbst betreten darf (ebenda) |
| „Nachrichten senden“ | das Menü im Menü-Kanal |

## Wenn etwas fehlt

- Fehlt dem Bot ein Recht oder ist die Kategorie voll, legt er keinen Raum
  an; das Mitglied bleibt im Erzeuger. Ins Log kommt eine Zeile ohne IDs
  und Namen.
- Wird ein Raum von Hand gelöscht, vergisst der Bot ihn.
- Beim Start vergisst der Bot Räume, die es nicht mehr gibt, und löscht
  Räume, die leer sind.
- Gibt es einen Erzeuger nicht mehr, wirkt er nicht; das Dashboard zeigt
  ihn als unbekannt.
- Verlässt der Bot einen Server, löscht er dessen Einstellungen und vergisst
  dessen Räume. Die Räume selbst bleiben dann bei Discord stehen.

## Was noch fehlt

- Kategorie wechseln: einen Raum in eine andere Kategorie der Erzeuger
  schieben.
- Weitere Einstellungen eines Raums, etwa Bitrate oder Region.
