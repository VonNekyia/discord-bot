---
title: "0011: Sprachräume mit Knöpfen statt Befehlen"
description: Warum Sprachräume über Erzeuger entstehen und mit Knöpfen, Formularen und Auswahlmenüs in einem einzigen Menü gesteuert werden, warum Sperren, Verstecken und Bann in den Rechten des Kanals stehen und nur der Besitzer in PostgreSQL, und welche Rechte der Bot dafür bekommt.
status: gilt
date: 2026-10-11
issues: []
code:
  - bot/src/index.ts
---

# 0011: Sprachräume mit Knöpfen statt Befehlen

## Anlass

Der Maintainer will Sprachkanäle auf Zeit: Wer einen bestimmten
Sprachkanal betritt, bekommt einen eigenen Raum, und der Raum lässt sich
ohne Befehle einstellen, nur mit Knöpfen in Discord. Das Team richtet das
im Dashboard ein. Was Nutzer sehen, steht in
[Sprachräume](../benutzung/sprachraeume.md), die Routen für das Dashboard in
[API der Sprachräume](../schnittstelle/sprachraeume.md).

## Entscheidung

- **Erzeuger:** Räume entstehen beim Betreten eines Erzeugers, gemeldet
  über den Intent `GuildVoiceStates`, siehe [Intents](../bot/intents.md).
- **Ein Menü je Server:** Eine Nachricht des Bots im Menü-Kanal trägt alle
  Knöpfe. Ein Knopf wirkt auf den Raum, in dem man gerade ist, und
  antwortet nur dem, der gedrückt hat. Umbenennen und Limit öffnen ein
  Formular, die Knöpfe für Mitglieder eine Auswahl.
- **Zustand bei Discord:** Gesperrt, versteckt und gebannt stehen in den
  Rechten des Kanals. In PostgreSQL stehen nur die Einstellungen des
  Servers, welche Kanäle Räume sind und wem sie gehören.
- **Rechte:** Der Bot bekommt „Kanäle verwalten“, „Rollen verwalten“,
  „Mitglieder verschieben“ und „Verbinden“, jedes begründet in
  [Sprachräume](../benutzung/sprachraeume.md), „Rechte und Intent“.

## Verworfene Alternativen

- **Slash-Befehle.** Der Maintainer will Knöpfe; Befehle muss man kennen
  und tippen.
- **Ein Menü in jedem Raum**, im Textchat des Sprachkanals. Je Raum eine
  Nachricht mehr, und sie verschwände mit dem Raum.
- **Gesperrt, versteckt und gebannt in der Datenbank.** Zwei Quellen für
  denselben Zustand; ändert das Team die Rechte von Hand, liefen sie
  auseinander.
- **Rechte im Raum für den Besitzer**, etwa „Kanäle verwalten“, statt
  Knöpfen. Der Besitzer könnte dann alles am Kanal ändern, auch Rechte für
  andere Rollen, und der Bot wüsste nichts davon.
- **Ein eigener Prozess für die Räume.** Gleicher Grund wie in
  [0008](0008-api-im-bot-prozess.md).

## Folgen

- „Rollen verwalten“ und „Mitglieder verschieben“ sind mächtige Rechte. Der
  Bot setzt sie nur an Räumen und Erzeugern ein; ein Team kann sie ihm auf
  die Kategorien der Räume beschränken.
- Der Bot speichert die Discord-ID des Besitzers jedes Raums, bis der Raum
  weg ist, siehe [Datenschutz](../bot/datenschutz.md).
- Der Einladungslink bekommt mehr Rechte; wer kitty schon eingeladen hat,
  gibt sie von Hand oder lädt neu ein.
- Discord begrenzt das Umbenennen von Kanälen; der Bot meldet dann die
  Wartezeit.
