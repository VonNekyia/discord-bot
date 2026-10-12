---
title: Struktur von Bot und Oberfläche
description: Wie bot/ und web/ in Schichten und Feature-Module geteilt sind, wer wen importieren darf, was ein Modul bündelt, wie die eigene Schicht über discord.js aussehen soll und was vom Umbau noch fehlt.
code:
  - bot/src/index.ts
  - bot/src/kern/fehler.ts
  - bot/src/kern/baukasten.ts
  - bot/.oxlintrc.json
  - web/src/dashboard.ts
  - web/src/seite.ts
  - web/.oxlintrc.json
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
| `bot/src/kern/` | Datenbank, Cache, Fehlertext fürs Log, Grenzen, Zählung, Aufräumen, der Vertrag des Baukastens; kennt weder Discord noch Module | `datenbank.ts`, `cache.ts`, `fehler.ts`, `grenze.ts`, `zaehlung.ts`, `aufraeumen.ts`, `baukasten.ts` |
| `bot/src/discord/` | die einzige Schicht, die discord.js importiert | `client.ts`, `ordnung.ts`, `zaehlen.ts`, `oauth.ts`, `kanaele.ts`, `kontext.ts`, `eigentuemer.ts`, `nachrichten.ts`, `server.ts`, `fehler.ts`, `rechte.ts`, `sprachkanaele.ts`, `menue.ts`, `interaktionen.ts` |
| `bot/src/api/` | HTTP-API des Dashboards: Server, Anmeldung, Grenzen, Fehler; die Routen der Seiten, die die Module anmelden | `server.ts`, `anmeldung.ts` |
| `bot/src/module/befehle/` | Slash-Befehle, heute `/ping` | `befehle.ts` |
| `bot/src/module/begruessung/` | Beitritt und Abschied: Einstellungen, Senden, Banner, Seiten im Dashboard | `begruessung.ts`, `senden.ts`, `banner.ts`, `seiten.ts` |
| `bot/src/module/sprachraeume/` | Sprachräume: Einstellungen, Räume, Menü, Knöpfe, Rechte, Seite im Dashboard | `sprachraeume.ts`, `raeume.ts`, `menue.ts`, `knoepfe.ts`, `raumrechte.ts`, `seiten.ts` |
| `bot/src/module/strafen/` | geplant, kommt mit seinem Auftrag | – |

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
| `web/src/bausteine/` | je Art von Baustein eine Datei: `schalter.ts`, `auswahl.ts`, `text.ts`, `zahl.ts`, `bild.ts`, `vorschau.ts`, `aktion.ts`, `liste.ts`, `hinweis.ts` |
| `web/src/api/` | die einzige Stelle mit `fetch`: Aufrufe und Typen der [API des Dashboards](../schnittstelle/api.md) und des [Baukastens](../schnittstelle/baukasten.md) |
| `web/src/kern/` | was alle Bausteine nutzen: Teil und Umgebung, Feld, Länge eines Texts, allgemeine Sätze und Meldungen |

## Grenzen

Ein Pfeil heisst „darf importieren“:

```text
Bot:  index.ts ──> module/* ──> discord/, kern/
               ──> api/     ──> discord/, kern/
      discord/ ──> kern/

Web:  dashboard.ts ──> seite.ts ──> bausteine/* ──> api/, kern/
                  ──> debug.ts ──> api/, kern/
      kern/ ──> api/
```

| Regel | Bot | Web | Lint |
|---|---|---|---|
| Nur die Discord-Schicht spricht mit discord.js | `discord.js` und `@discordjs/*` nur in `src/discord/` und `src/index.ts` | – | `no-restricted-imports` |
| Nur die API-Schicht spricht mit dem Bot | – | `fetch` nur in `src/api/` | `no-restricted-globals` |
| Ein Modul importiert kein anderes | `src/module/*` | – | `no-restricted-imports` |
| Ein Baustein importiert keinen anderen und kennt die Seite nicht | – | `src/bausteine/*` | `no-restricted-imports` |
| Die API kennt kein Modul; jedes Modul meldet seine Routen an | `src/api/` importiert nichts aus `src/module/` | `src/api/` importiert nichts Eigenes | `no-restricted-imports` |
| Der Kern kennt keine Schicht über sich | `src/kern/` | `src/kern/` nur `src/api/` und sich | `no-restricted-imports` |
| Keine Kreise | überall | überall | `import/no-cycle` |

Tests sind ausgenommen: Sie bauen discord.js nach und dürfen alles
importieren. Die Regeln stehen in `bot/.oxlintrc.json` und
`web/.oxlintrc.json`, siehe [Lint mit oxlint](lint.md).

Kern und Discord-Schicht im Bot und alle Schichten der Oberfläche halten
die Grenzen schon; der Linter meldet dort Fehler. In `bot/src/api/` und
`bot/src/module/` sind es noch Warnungen, siehe „Was noch fehlt“.

## Ein Modul

Was ein Modul im Bot bündelt, wenn der Umbau fertig ist:

| Teil | Inhalt |
|---|---|
| Einstellungen | lesen, prüfen, speichern; die Tabellen gehören dem Modul |
| Ereignisse | an welchen Ereignissen es hängt, über die Discord-Schicht |
| Seiten | seine Seiten im Dashboard als `Bereich`, siehe [Baukasten des Dashboards](../schnittstelle/baukasten.md); `api/` baut daraus die Routen |
| Aufräumen | was es löscht, wenn der Bot einen Server verlässt; alle Module in einer Transaktion, wie heute `kern/aufraeumen.ts` in einer Anweisung |
| Befehle | seine Slash-Befehle, falls es welche hat |

Jedes Modul gibt dazu ein Objekt nach einem Vertrag in `bot/src/kern/`
heraus; `index.ts` reicht die Module an Discord-Schicht und API weiter,
statt jedes einzeln zu verdrahten. Für die Seiten gibt es den Vertrag
schon: `Bereich` in `bot/src/kern/baukasten.ts`. In der Oberfläche
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
gibt den Modulen Griff und `Mitglied`.

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
| discord.js direkt in Modulen | `befehle.ts`, Stufe 5 | 1 Warnung |
| discord.js direkt in der API | `api/server.ts`, `api/anmeldung.ts` | 2 Warnungen |
| Aufräumen kennt die Tabellen aller Module | `kern/aufraeumen.ts` | – |
| Der Einstieg verdrahtet jedes Modul einzeln; nur die Seiten gehen schon als `Bereich` | `index.ts` | – |
| Befehle registrieren steckt im Modul Befehle | `registriere` in `module/befehle/befehle.ts` | – |
| Die Typen der API stehen dreimal: in `docs/schnittstelle/`, in `bot/src/kern/baukasten.ts` und in `web/src/api/klient.ts` | – | – |
