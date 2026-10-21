---
title: Befehle
description: Jeder Slash-Befehl mit Antwort, Sichtbarkeit und den Rechten, die er braucht; was das Modul beschreibt und was die Discord-Schicht tut; Antwortzeit und Fehler.
code:
  - bot/src/module/befehle/befehle.ts
  - bot/src/discord/befehle.ts
  - bot/src/kern/datenbank.ts
  - bot/src/module/befehle/modul.ts
  - bot/src/discord/modul.ts
---

# Befehle

Alle Befehle sind globale Slash-Befehle und stehen in `befehle` in
`bot/src/module/befehle/befehle.ts`. Ein neuer Befehl kommt mit dem Skill
[`befehl-hinzufuegen`](../../skills/befehl-hinzufuegen/SKILL.md).

| Befehl | Antwort | Sichtbar für | Rechte des Bots | Intents |
|---|---|---|---|---|
| `/ping` | `Pong. Datenbank: <n> ms.`, oder `nicht erreichbar` | nur den Nutzer (ephemeral) | keine | `Guilds` |
| `/ban`, `/kick`, `/warn` | siehe [Managed Commands](managed-commands.md), „Antworten“ | nur den Nutzer (ephemeral) | Mitglieder bannen, Mitglieder kicken | `Guilds` |

## Aufbau

Das Modul Befehle (`bot/src/module/befehle/modul.ts`) hat nur Befehle,
keine Tabellen und Seiten. Ein anderes Modul bringt seine Befehle in
`befehle` seines `DiscordModul` mit, siehe
[Struktur von Bot und Oberfläche](../entwicklung/struktur.md), „Ein Modul“.

Das Modul kennt kein discord.js. Ein Befehl ist ein `Befehl` aus
`bot/src/discord/befehle.ts`: `name`, `beschreibung` und
`ausfuehren(aufruf)`, dazu wahlweise `nurServer` (`contexts` nur `GUILD`)
und `optionen`. Eine Option ist ein Nutzer oder ein Text mit `hoechstens`
(`max_length`) und, für Autocomplete, `vorschlaege`; jede ist Pflicht. Den
Rest macht die Discord-Schicht:

| Was | wo |
|---|---|
| beim Start alle registrieren | `registriere`, siehe [Rate-Limits](../bot/rate-limits.md), „Befehle registrieren“ |
| den Befehl zum Namen finden und ausführen | `beantworte`, aus `haengeAn` in `bot/src/discord/modul.ts` bei jedem Slash-Befehl, mit den Befehlen aller Module (`befehleVon`) |
| antworten | `Aufruf#antworte`: gleich, nur für den Nutzer (ephemeral), ohne Erwähnungen; scheitert es, wirft es `DiscordFehler` |
| später antworten | `Aufruf#warte` schiebt die Antwort auf (`deferReply`, ephemeral), `Aufruf#fertig` setzt sie |
| Formular | `Aufruf#zeigeFormular`, nur als erste Antwort; abgeschickt kommt es als `Druck` mit `art` `formular` an die `knoepfe` des Moduls mit seinem Präfix |
| Optionen lesen | `Aufruf#text`, `Aufruf#ziel` mit `Person` und, für ein Mitglied, `Rang` aus `bot/src/discord/mitglieder.ts`; auf einem Server `Aufruf#ort` mit Server, `wer` und `rang` |
| Autocomplete | `schlageVor`, aus `haengeAn`: die `vorschlaege` der Option, höchstens 25; ist das Modul aus oder scheitert es, eine leere Liste |
| Fehler | `beantworte` fängt sie, siehe „Fehler“ |
| Modul aus | ist das Modul des Befehls auf dem Server aus, antwortet `haengeAn` statt des Befehls nur für den Nutzer `modulAus`, siehe [Board der Module](../schnittstelle/module.md), „Ein Modul ist aus“; scheitert die Frage danach, den Satz aus „Fehler“; `/ping` hat keinen Schalter |

## Antwortzeit

Discord erwartet die erste Antwort auf eine Interaktion innerhalb von 3 s,
sonst sieht der Nutzer „Die Anwendung reagiert nicht“, siehe die
[Doku von Discord](https://discord.com/developers/docs/interactions/receiving-and-responding#responding-to-an-interaction).
`/ping` wartet darum höchstens 2 s auf die Datenbank (`misse` in
`bot/src/kern/datenbank.ts`, `frist`) und antwortet dann „nicht erreichbar“. Ein
Befehl, der länger braucht, muss die Antwort aufschieben; dafür bekommt
`Aufruf` zuerst ein `warte`, wie `Druck` in `bot/src/discord/interaktionen.ts`.

## Fehler

Schlägt ein Befehl fehl oder ist er unbekannt, sieht der Nutzer
„Das hat nicht geklappt.“ (`fehlgeschlagen` in `bot/src/discord/befehle.ts`),
nur für ihn. Ebenso, wenn sich nicht klären lässt, ob sein Modul an ist,
etwa ohne Datenbank; dann steht `Board: <Fehler>` im Log.

Dauert diese Frage länger als 2 s (`fristInteraktion` in
`bot/src/discord/modul.ts`), etwa weil die Freischaltung eines bezahlten
Moduls auf Discord wartet, kommt der Satz auch, mit
`Board: keine Antwort nach 2000 ms` im Log. Das gilt ebenso für Knöpfe;
Autocomplete bekommt dann eine leere Liste. Discord wartet höchstens 3 s
auf die erste Antwort, und ein Formular muss die erste sein.

Wohin die Meldung geht, hängt davon ab, wie weit der Befehl gekommen ist
(`beantworte` in `bot/src/discord/befehle.ts`):

| Stand | Meldung |
|---|---|
| aufgeschoben (`warte`), noch ohne Antwort | ersetzt die aufgeschobene Antwort (`editReply`); bei `/ban`, `/kick` und `/warn` der Normalfall |
| schon geantwortet | als zweite Nachricht (`followUp`) |
| sonst | als erste Antwort (`reply`) |

Scheitert auch die Meldung, steht `/<befehl>: Antwort fehlgeschlagen: <Fehler>`
im Log. Was ins Log geht, steht in [Datenschutz](../bot/datenschutz.md),
„Was ins Log geht“.
