---
title: "0019: Module je Server an und aus"
description: Warum ein Board je Server die Module an- und ausschaltet, als eigene Schicht neben api/ und nicht als Modul; frei heisst an, bezahlt heisst aus bis zur Freischaltung, aus heisst inaktiv bis auf das Aufräumen; neue Bausteine link und schalter mit gesperrt, alleNeu an der Seite.
status: gilt
date: 2026-10-17
issues: []
code:
  - bot/src/kern/baukasten.ts
  - bot/src/kern/modul.ts
  - bot/src/discord/modul.ts
  - bot/src/api/server.ts
---

# 0019: Module je Server an und aus

## Anlass

Der Maintainer will je Server die Module an- und ausschalten. Im Dashboard
sollen nur die Module stehen, die an sind. Mit Managed Commands kommt das
erste bezahlte Modul; es soll nur angehen, wenn es auf dem Server freigeschaltet ist.
Stand vorher:

- jedes Modul wirkt auf jedem Server, sobald es eingestellt ist;
- der Baukasten kennt keinen gesperrten Schalter, keinen Link nach aussen
  und kein Neuladen der Tabs;
- ein Modul importiert kein anderes, und `api/` und `discord/` kennen kein
  Modul ([0015](0015-feature-module-und-schichten.md)).

## Entscheidung

Ein Board je Server hält, welches Modul an ist, wie in
[Board der Module](../schnittstelle/module.md):

- **Ort:** `bot/src/brett/`, eine eigene Schicht neben `api/`. Sie liest
  von jedem Modul nur, was es im Vertrag `Modul` über seinen Schalter
  anmeldet. `haengeAn` und die API bekommen von `index.ts` nur eine
  Funktion „ist an“.
- **Standard:** Freie Module sind ohne gespeicherten Stand an, bezahlte
  aus. Ein bezahltes ist nur an, wenn es freigeschaltet ist; wie, ob
  einmalig oder im Abo, entscheidet eine eigene Entscheidung mit dem
  ersten bezahlten Modul. Befehle (`/ping`) steht nicht auf
  dem Board.
- **Aus heisst inaktiv:** keine Ereignisse, keine Seiten, Befehle und
  Knöpfe sagen, dass das Modul aus ist. Was ein Modul aufräumen muss,
  etwa leere Sprachräume, tut es auch aus. Die Einstellungen bleiben.
- **Baukasten:** ein `schalter` mit `gesperrt`, ein Baustein `link` in den
  Store von Discord und `alleNeu` an der Seite, damit nach dem Speichern
  die Tabs stimmen. Routen einer Seite, deren Modul aus ist, geben `409`
  `modul_aus`.

## Verworfene Alternativen

- **Das Board als Modul unter `bot/src/module/`.** Es müsste jedes andere
  Modul kennen; das verbietet Regel 32.
- **Das Board in `api/`.** Die Sperre gilt auch für Ereignisse, Befehle
  und Knöpfe, die mit der API nichts zu tun haben; und die API soll kein
  Modul kennen.
- **Das Board in `kern/`.** Es braucht den `Kontext` und die Entitlements aus der
  Discord-Schicht; der Kern kennt keine Schicht über sich.
- **Je Modul ein Schalter auf seinem eigenen Tab.** Ein ausgeschaltetes
  Modul hätte dann keinen Tab mehr, auf dem man es wieder anschaltet.
- **Beim Ausschalten die Einstellungen löschen.** Der Maintainer will sie
  behalten; wer wieder anschaltet, soll nicht neu einstellen.
- **Befehle eines Moduls je Server registrieren und wieder entfernen.**
  Befehle je Server kosten je Server Aufrufe beim Start und bei jedem
  Schalten und laufen ins Rate-Limit; globale Befehle mit einer Antwort
  „Modul aus“ kosten nichts, siehe [Rate-Limits](../bot/rate-limits.md),
  „Befehle registrieren“.
- **Den Kauf-Link als Teil des Schalters.** Ein eigener Baustein `link`
  taugt auch für andere Seiten; der Schalter bleibt einfach.
- **`404` für Routen eines ausgeschalteten Moduls.** `404` kommt vor
  Sitzung und Rechten und hiesse, die Seite gibt es nicht; ob ein Modul an
  ist, hängt aber vom Server ab, und die Oberfläche soll den Fall erkennen
  und die Tabs neu holen.
- **Die Art der Bezahlung im Vertrag des Boards festlegen.** Einmalkauf
  und Abo binden Entitlements verschieden an Nutzer und Server; das Board
  braucht nur „freigeschaltet, ja oder nein“. Preis, Art und Link zum
  Kaufen kommen mit dem ersten bezahlten Modul dazu.

## Folgen

- Eine neue Tabelle für den Zustand je Server; das Board meldet sie an
  `Aufraeumen`, obwohl es kein Modul ist.
- Jedes Ereignis, jeder Befehl und jeder Knopf fragt vorher, ob das Modul
  auf dem Server an ist; das kostet je Server eine Abfrage, bis der Cache
  sie hält.
- Das Board ist ein Tab; mit Begrüssung, Sprachräumen und Managed
  Commands sind es 5 von 6; das Log braucht den sechsten.
- Wer das Board speichert, verliert, was in anderen Tabs ungespeichert war.
- Für ein bezahltes Modul, das nicht freigeschaltet ist, behält der Bot
  beim Speichern den gespeicherten Schalter. Kommt die Freischaltung
  wieder, ist das Modul ohne Zutun so wie vorher; dafür hält der Bot je
  Server einen Schalter, den die Oberfläche gerade nicht zeigt.
- Wie der Bot eine Freischaltung prüft, kommt mit dem ersten bezahlten
  Modul in eine eigene Entscheidung.
