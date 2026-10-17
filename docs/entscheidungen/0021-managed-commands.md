---
title: "0021: Managed Commands mit Rollenliste, Limit und eigenem Grund"
description: Warum /ban, /kick und /warn eine eigene Liste von Rollen mit Limits prüfen statt der Rechte von Discord, warum der Grund Autocomplete mit freiem Text und einem Formular für „custom“ ist, warum der Bot die Rollenhierarchie auch für den Nutzer prüft und was er wie lange speichert.
status: gilt
date: 2026-10-17
issues: []
code:
  - bot/src/discord/befehle.ts
---

# 0021: Managed Commands mit Rollenliste, Limit und eigenem Grund

## Anlass

Der Maintainer will `/ban`, `/kick` und `/warn` mit vorgefertigten
Gründen, einem eigenen Grund über „custom“ und einem Limit je Rolle, wie
viele Bans und Kicks ihre Mitglieder pro Woche frei haben. Er hat
festgelegt:

- Das Limit zählt rollierend die letzten 7 Tage.
- Hat ein Mitglied mehrere Rollen, gilt das höchste Limit.
- Nur Mitglieder mit einer Rolle aus der Liste dürfen die Befehle nutzen.
- Eigentümer und Administratoren haben kein Limit.
- `/warn` hat kein Limit, schickt den Grund als DM und speichert die
  Verwarnung; die Antwort nennt, die wievielte es ist.

## Entscheidung

Wie in [Managed Commands](../benutzung/managed-commands.md) und
[API der Managed Commands](../schnittstelle/strafen.md):

- **Wer darf:** Der Bot prüft selbst gegen die Liste der Rollen aus dem
  Dashboard. `default_member_permissions` setzt er nicht.
- **Hierarchie:** Ausser der Regel von Discord für den Bot prüft er, dass
  die höchste Rolle des Ziels unter der höchsten Rolle dessen steht, der
  den Befehl nutzt; der Eigentümer ist ausgenommen.
- **Grund:** Text mit Autocomplete. Die Vorschläge sind die Gründe des
  Servers und „Eigener Grund …“ mit dem Wert `custom`, der ein Formular
  öffnet. Freier Text zählt als eigener Grund.
- **Limit:** Bans und Kicks, die geklappt haben, je Mitglied und Server,
  der letzten 168 Stunden. Zählen und Eintragen geschehen unter einer
  Sperre je Mitglied und Server.
- **Speichern:** Für das Limit nur Server, wer, was und wann, 7 Tage lang.
  Für die Verwarnung Server, Ziel, wer, Grund und wann, so lange, wie der
  Server in `verwarnungTage` einstellt: 30 bis 730 Tage, Standard 365. So
  hat der Maintainer entschieden.
  Siehe [Datenschutz](../bot/datenschutz.md).

## Verworfene Alternativen

- **`default_member_permissions` auf „Mitglieder bannen“ und „Mitglieder
  kicken“.** Dann sähen Mitglieder mit einer Rolle aus der Liste die
  Befehle nicht, wenn die Rolle das Recht bei Discord nicht hat. Der
  Maintainer will, dass die Liste entscheidet.
- **Feste `choices` statt Autocomplete.** Choices gelten für alle Server
  gleich, weil die Befehle global registriert sind; jeder Server hat aber
  eigene Gründe. Je Server registrierte Befehle verwirft
  [0019](0019-module-an-und-aus.md).
- **Freien Text ablehnen.** Discord lässt ihn bei Autocomplete zu; ein
  Fehler dafür kostet nur einen zweiten Versuch, ohne etwas zu schützen.
- **Den eigenen Grund als zweite Option.** Zwei Optionen für einen Grund
  sind schwerer zu verstehen als ein Formular, und das Formular wollte der
  Maintainer.
- **Nur die Hierarchie von Discord.** Sie schützt nur vor dem Bot. Mit
  einer Rolle aus der Liste könnte jemand über den Bot Mitglieder bannen,
  die über ihm stehen.
- **Eine feste Frist für Verwarnungen, gleich für alle Server.** Der
  Maintainer will, dass jeder Server sie selbst einstellt.
- **Ein festes Limit je Kalenderwoche.** Am Montag wäre alles wieder frei;
  der Maintainer will rollierend 7 Tage.
- **Ziel und Grund jedes Bans und Kicks speichern.** Für das Limit reicht,
  wer und wann. Das Log kommt mit seinem eigenen Modul.

## Folgen

- Die Discord-Schicht bekommt Optionen, Autocomplete, ein Formular als
  erste Antwort und `warte` für Befehle, siehe `managed-commands-backend`.
- Wer die Befehle nutzen darf, ist nicht in Discord sichtbar, nur im
  Dashboard.
- „Zum n. Mal“ zählt in der Frist des Servers, ohne Einstellung im
  letzten Jahr. Wird die Frist kürzer, gehen ältere Verwarnungen beim
  nächsten Aufräumen.
- Ein Mitglied, das nicht auf dem Server ist, lässt sich bannen, aber
  nicht kicken oder verwarnen, und bekommt keine DM.
