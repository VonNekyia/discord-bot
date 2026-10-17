---
title: Struktur von Bot und Oberfläche
description: Wie bot/ und web/ in Schichten und Feature-Module geteilt sind, wer wen importieren darf, was ein Modul bündelt, wie die eigene Schicht über discord.js aussehen soll und was vom Umbau noch fehlt.
code:
  - bot/src/index.ts
  - bot/src/kern/fehler.ts
  - bot/src/kern/baukasten.ts
  - bot/src/kern/modul.ts
  - bot/src/modulliste.ts
  - bot/.oxlintrc.json
  - web/src/dashboard.ts
  - web/src/seite.ts
  - web/.oxlintrc.json
  - bot/src/discord/modul.ts
  - bot/src/brett/brett.ts
---

# Struktur von Bot und Oberfläche

Jede Feature-Suite ist ein Modul: Befehle, Begrüssung, Sprachräume, später
Strafen. Ein Modul hat seinen Ordner unter `bot/src/module/`. Seine
Oberfläche meldet es als Seiten im Baukasten an; `web/` hat keine Ordner
je Modul, sondern baut jede Art von Baustein allgemein. Darunter liegen
Schichten, die alle Module nutzen: der Kern, eine eigene Schicht über
discord.js und die API des Dashboards. Wer wen importieren darf, prüft der
Linter. Warum so, steht in
[0015](../entscheidungen/0015-feature-module-und-schichten.md) und
[0017](../entscheidungen/0017-dashboard-als-baukasten.md).

## Bot

| Pfad | Inhalt | Dateien, Stand 2026-10-12 |
|---|---|---|
| `bot/src/index.ts` | Einstieg: verbindet Kern, Discord-Schicht, API und Module | |
| `bot/src/modulliste.ts` | `alleModule`: die Liste der Module, in der Reihenfolge der Tabs | |
| `bot/src/kern/` | Datenbank, Cache, Fehlertext fürs Log, Typwächter für Eingaben, Grenzen, Zählung, Aufräumen, der Vertrag des Baukastens; kennt weder Discord noch Module | `datenbank.ts`, `cache.ts`, `fehler.ts`, `eingabe.ts`, `grenze.ts`, `zaehlung.ts`, `aufraeumen.ts`, `baukasten.ts`, `modul.ts` |
| `bot/src/discord/` | die einzige Schicht, die discord.js importiert | `client.ts`, `ordnung.ts`, `zaehlen.ts`, `oauth.ts`, `kanaele.ts`, `kontext.ts`, `eigentuemer.ts`, `nachrichten.ts`, `server.ts`, `fehler.ts`, `rechte.ts`, `sprachkanaele.ts`, `menue.ts`, `interaktionen.ts`, `befehle.ts`, `dashboard.ts`, `modul.ts` |
| `bot/src/api/` | HTTP-API des Dashboards: Server, Anmeldung, Grenzen, Fehler; die Routen der Seiten, die die Module anmelden | `server.ts`, `anmeldung.ts` |
| `bot/src/brett/` | das Board der Module: je Server, welches Modul an ist, und seine Seite; kein Modul, siehe [Board der Module](../schnittstelle/module.md) | `brett.ts` |
| `bot/src/module/befehle/` | Slash-Befehle, heute `/ping` | `befehle.ts`, `modul.ts` |
| `bot/src/module/begruessung/` | Beitritt und Abschied: Einstellungen, Senden, Banner, Seiten im Dashboard | `begruessung.ts`, `senden.ts`, `banner.ts`, `seiten.ts`, `modul.ts` |
| `bot/src/module/sprachraeume/` | Sprachräume: Einstellungen, Räume, Menü, Knöpfe, Rechte, Seite im Dashboard | `sprachraeume.ts`, `raeume.ts`, `menue.ts`, `knoepfe.ts`, `raumrechte.ts`, `seiten.ts`, `modul.ts` |
| `bot/src/module/strafen/` | Managed Commands: `/ban`, `/kick`, `/warn`, Seite „Managed Commands“; geplant, siehe [API der Managed Commands](../schnittstelle/strafen.md) | – |

Tests liegen neben dem Code, den sie prüfen; `bot/src/testhilfe.ts` hilft
allen. `dist/` spiegelt `src/`; `npm test` findet die Tests mit
`dist/**/*.test.js`.

## Oberfläche

| Pfad | Inhalt |
|---|---|
| `web/src/main.ts` | Startseite |
| `web/src/dashboard.ts` | Rahmen: Anmeldung, Serverliste, je Seite ein Tab |
| `web/src/seite.ts` | baut eine Seite aus ihren Bausteinen: Formular, Speichern, Fehler am Feld |
| `web/src/debug.ts` | die Debug-Ansicht: keine Seite des Baukastens, eine feste Ansicht im Rahmen |
| `web/src/bausteine/` | je Art von Baustein eine Datei: `schalter.ts`, `auswahl.ts`, `text.ts`, `zahl.ts`, `bild.ts`, `vorschau.ts`, `aktion.ts`, `liste.ts`, `hinweis.ts`, `link.ts` |
| `web/src/api/` | die einzige Stelle mit `fetch`: Aufrufe und Typen der [API des Dashboards](../schnittstelle/api.md) und des [Baukastens](../schnittstelle/baukasten.md) |
| `web/src/kern/` | was alle Bausteine nutzen: Teil und Umgebung, Feld, Länge eines Texts, allgemeine Sätze und Meldungen |

## Grenzen

Ein Pfeil heisst „darf importieren“:

```text
Bot:  index.ts ──> modulliste.ts ──> module/*
               ──> module/*     ──> discord/, kern/
               ──> api/         ──> discord/, kern/
               ──> brett/       ──> discord/, kern/
               ──> discord/     ──> discord.js, kern/
               ──> discord.js

Web:  dashboard.ts ──> seite.ts ──> bausteine/* ──> api/, kern/
                  ──> debug.ts ──> api/, kern/
      kern/ ──> api/
```

| Regel | Bot | Web | Lint |
|---|---|---|---|
| Nur die Discord-Schicht spricht mit discord.js | `discord.js` und `@discordjs/*` nur in `src/discord/` und `src/index.ts` | – | `no-restricted-imports` |
| Nur die API-Schicht spricht mit dem Bot | – | `fetch` nur in `src/api/` | `no-restricted-globals` |
| Ein Modul importiert kein anderes | `src/module/*` | – | `no-restricted-imports` |
| Das Board kennt kein Modul und keine Schicht kennt das Board | `src/brett/` importiert nichts aus `src/module/` und `src/api/`; `src/module/`, `src/api/`, `src/discord/` und `src/kern/` nichts aus `src/brett/` | – | `no-restricted-imports` |
| Ein Baustein importiert keinen anderen und kennt die Seite nicht | – | `src/bausteine/*` | `no-restricted-imports` |
| Die API kennt kein Modul; jedes Modul meldet seine Routen an | `src/api/` importiert nichts aus `src/module/` | `src/api/` importiert nichts Eigenes | `no-restricted-imports` |
| Der Kern kennt keine Schicht über sich | `src/kern/` | `src/kern/` nur `src/api/` und sich | `no-restricted-imports` |
| Keine Kreise | überall | überall | `import/no-cycle` |

Tests sind ausgenommen: Sie bauen discord.js nach und dürfen alles
importieren. Die Regeln stehen in `bot/.oxlintrc.json` und
`web/.oxlintrc.json`, siehe [Lint mit oxlint](lint.md).

discord.js importieren nur `bot/src/discord/` und `bot/src/index.ts`;
Module und API sehen eigene Typen der Discord-Schicht, die API über
`DashboardGriff` aus `discord/dashboard.ts`. Alle Schichten in Bot und
Oberfläche halten die Grenzen; der Linter meldet jede Verletzung als
Fehler.

## Ein Modul

Was ein Modul im Bot bündelt:

| Teil | Inhalt |
|---|---|
| Einstellungen | lesen, prüfen, speichern; die Tabellen gehören dem Modul |
| Ereignisse | an welchen Ereignissen es hängt, über die Discord-Schicht |
| Seiten | seine Seiten im Dashboard als `Bereich`, siehe [Baukasten des Dashboards](../schnittstelle/baukasten.md); `api/` baut daraus die Routen |
| Aufräumen | seine Tabellen mit Daten je Server und seine Caches; `Aufraeumen` in `kern/aufraeumen.ts` löscht die Tabellen aller Module in einer Anweisung |
| Befehle | seine Slash-Befehle als `Befehl` aus `discord/befehle.ts`, falls es welche hat |

Jedes Modul gibt dazu ein Objekt nach dem Vertrag `Modul` in
`bot/src/kern/modul.ts` heraus, aus einer Fabrik in seinem `modul.ts`:

| Feld | Inhalt |
|---|---|
| `name` | für Fehler beim Start |
| `tabellen` | Tabellen mit der Spalte `server`; verlässt der Bot einen Server, gehen ihre Zeilen |
| `vergiss(server)` | vergisst, was das Modul im Speicher zum Server hält, etwa im Cache |
| `bereich` | seine Seiten im Dashboard, `Bereich` aus `bot/src/kern/baukasten.ts` |
| `schalter` | sein Schalter auf dem Board: `titel`, `hilfe`, `bezahlt`; ohne ihn ist das Modul immer an, siehe [Board der Module](../schnittstelle/module.md) |

Was nur die Discord-Schicht kennt, kommt in `DiscordModul` aus
`bot/src/discord/modul.ts` dazu; der Vertrag in `kern/` kennt keine Typen
von Discord:

| Feld | Inhalt |
|---|---|
| `befehle` | seine Slash-Befehle als `Befehl` aus `discord/befehle.ts` |
| `knoepfe` | `praefix` und `bediene(druck)`: Knöpfe, Nutzerauswahl und Formulare mit `praefix` am Anfang von `custom_id` |
| `ereignisse` | was es bei Ereignissen von Discord tut, mit eigenen Typen; siehe unten; nur auf Servern, auf denen es an ist |
| `aufraeumen` | dieselben Ereignisse, aber immer, auch wenn es aus ist: was aufgeräumt werden muss, etwa leere Sprachräume |

| Ereignis | von Discord | wer ruft |
|---|---|---|
| `bereit(server)` | `ClientReady`, mit den Servern dieses Prozesses; in `ereignisse` nur die, auf denen das Modul an ist | `meldeBereit` aus `bot/src/index.ts`, nach dem Abgleich der Server, Modul für Modul |
| `beitritt(mitglied)`, `abschied(mitglied)` | `guildMemberAdd`, `guildMemberRemove`, mit `alsMitglied` | `haengeAn` |
| `stimme(server, nutzer, vorher, nachher)` | `voiceStateUpdate` | `haengeAn` |
| `kanalWeg(kanal)` | `channelDelete`, nur Kanäle eines Servers | `haengeAn` |

`alleModule` in `bot/src/modulliste.ts` gibt die Liste, und
`bot/src/index.ts` reicht sie weiter:

- die Liste an das Board (`Brett` in `bot/src/brett/brett.ts`), das daraus
  die Schalter liest;
- die Bereiche an die API, das Board als letzten, mit `istAn` je Bereich;
  die Tabellen und die des Boards an `Aufraeumen`, `vergiss` an
  `guildDelete`;
- die Befehle aller Module (`befehleVon`) an `registriere`;
- die Ereignisse, Befehle und Knöpfe an `haengeAn(client, liste, istAn)` in
  `bot/src/discord/modul.ts`. Es hängt jedes Ereignis einmal an den Client
  und gibt es den Modulen in der Reihenfolge der Liste: `aufraeumen` immer,
  `ereignisse` nur, wenn `istAn` für das Modul und den Server `true` gibt.
  Befehle und Knöpfe eines Moduls, das aus ist, antworten `modulAus`.
  Scheitert `istAn`, steht `Board: <Fehler>` im Log. Ein Ereignis behandelt
  das Modul dann wie aus. Ein Befehl oder Knopf antwortet mit dem
  allgemeinen Satz `fehlgeschlagen`, siehe [Befehle](../benutzung/befehle.md),
  „Fehler“, denn auf dem Board steht das Modul an.

Jedes Modul fängt seine Fehler selbst und loggt sie. Der Vertrag wächst,
wenn ein Modul mehr braucht.

Der Test „jede Tabelle mit Daten je Server … gehört genau einem Modul“ in
`bot/src/modulliste.test.ts` vergleicht die Tabellen der Module mit
`information_schema` nach allen Migrationen. Vergisst ein Modul eine
Tabelle, fällt er. In der Oberfläche
braucht ein Modul keinen Code, solange es mit den Bausteinen auskommt.

Ein neues Modul bekommt seinen Ordner, Tests daneben, eine Seite unter
`docs/benutzung/` und, wenn es Seiten im Dashboard hat, zuerst eine Seite
unter `docs/schnittstelle/` (`AGENTS.md`, „Rollen“).

## Die Discord-Schicht

Module sehen nur eigene Typen, nicht die von discord.js. `bot/src/discord/`
bietet je Bedarf eine Funktion mit eigenem Typ, etwa „Nachricht in einen
Kanal senden“, „Sprachkanal anlegen“, „Rechte eines Kanals setzen“ oder
„Mitglied verschieben“. Sie übersetzt Fehler von Discord in eigene Codes,
etwa „kein Recht“, „nicht gefunden“ oder „zu schnell, mit Wartezeit“
(`DiscordFehler` in `discord/fehler.ts`).

Einen Server sehen Module nur als Griff `Server` aus `discord/server.ts`:
ID und Name. Die Guild dahinter liest nur die Discord-Schicht mit
`guildVon`; kein Modul bekommt sie heraus, und keine Funktion der Schicht
gibt sie zurück. Der Linter verbietet Modulen den Import von `guildVon`.
Den Griff baut nur `serverVon`; eine Guild oder ein Objekt mit ID und Name
passt nicht, wo ein Griff verlangt ist. `Kontext` aus `discord/kontext.ts`
gibt den Modulen Griff und `Mitglied`; die API bekommt ihn von `verwaltet`,
nach der Prüfung der Rechte.

- Ein Test eines Moduls braucht dann keinen nachgebauten Client von
  discord.js mehr, nur eine Fälschung der Schicht.
- Ein Update von discord.js trifft nur `bot/src/discord/`.
- An dieser einen Stelle zählt und loggt der Bot Anfragen an Discord und
  ihre Rate-Limits: `discord/zaehlen.ts` hört auf `client.rest`, die Zahlen
  hält `kern/zaehlung.ts`, siehe [Rate-Limits](../bot/rate-limits.md),
  „Zählen“. Auch die Anmeldung fragt Discord über diese Schicht
  (`discord/oauth.ts`).

## Was noch fehlt

Stand 2026-10-12. Der Umbau geht Modul für Modul, jede Stufe als eigene
PR mit gleichem Verhalten und grünen Tests.

| Was | Wo | Lint |
|---|---|---|
| Die Typen der API stehen dreimal: in `docs/schnittstelle/`, in `bot/src/kern/baukasten.ts` und in `web/src/api/klient.ts` | – | – |
