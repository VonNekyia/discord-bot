---
title: Begrüssung bei Beitritt und Abschied
description: Was der Bot schickt, wenn jemand einem Server beitritt oder ihn verlässt; Platzhalter, Banner aus einem eigenen Bild, Standardwerte, Rechte und Intent, die Bremse bei vielen Beitritten.
code:
  - bot/src/index.ts
  - bot/src/module/begruessung/begruessung.ts
  - bot/src/module/begruessung/senden.ts
  - bot/src/module/begruessung/banner.ts
  - bot/src/kern/namen.ts
  - bot/src/module/begruessung/glyphen.ts
---

# Begrüssung bei Beitritt und Abschied

Tritt jemand einem Server bei oder verlässt ihn, schickt der Bot eine
Nachricht in den Kanal, den das Team des Servers im Dashboard wählt: einen
Text mit Platzhaltern, ein Banner aus einem eigenen Bild, oder beides.
Beitritt und Abschied werden getrennt eingestellt. Dafür braucht der Bot den
privilegierten Intent `GuildMembers` und `Partials.GuildMember`, siehe
[Intents](../bot/intents.md). Eingestellt wird über die
[API des Dashboards](../schnittstelle/api.md). Auf dem
[Board der Module](../schnittstelle/module.md) lässt sich das ganze Modul
ausschalten; dann schickt der Bot nichts, und die Einstellungen bleiben.

## Platzhalter

| Platzhalter | wird zu | längster Wert im Text | längster Wert im Banner |
|---|---|---|---|
| `{nutzer}` | Erwähnung des Mitglieds; im Banner `@` und Anzeigename | 23 Zeichen | 33 Zeichen |
| `{name}` | Anzeigename auf dem Server; im Text Markdown maskiert | 64 Zeichen | 32 Zeichen |
| `{server}` | Name des Servers; im Text Markdown maskiert | 200 Zeichen | 100 Zeichen |
| `{anzahl}` | ungefähre Zahl der Mitglieder nach dem Beitritt oder Abschied, als Ziffern | 10 Zeichen | 10 Zeichen |

- Zeichen zählen wie in [API des Dashboards](../schnittstelle/api.md),
  „Einstellung speichern“.
- Anzeigename heisst: der Spitzname auf dem Server, sonst der globale
  Anzeigename, sonst der Nutzername. Beim Abschied eines Mitglieds, das
  nicht im Cache war, kennt der Bot den Spitznamen nicht; dann gilt der
  globale Anzeigename, siehe [Intents](../bot/intents.md), „Partials“.
- `{anzahl}` ist `memberCount` von discord.js. Die Zahl kommt beim Start
  von Discord und wird bei jedem Beitritt und Abschied um 1 fortgeschrieben.
  Nach einer Lücke im Gateway kann sie etwas abweichen.
- Anzeigename und Servername sind höchstens 32 und 100 Zeichen lang; das
  Maskieren im Text setzt vor ein Zeichen höchstens einen `\`, darum dort
  das Doppelte. Belege: [Users](https://docs.discord.com/developers/resources/user),
  [Guild](https://docs.discord.com/developers/resources/guild).
- Andere Wörter in geschweiften Klammern bleiben, wie sie sind. Gross- und
  Kleinschreibung zählt.
- Hakenkreuze und SS-Runen schreibt der Bot nie: nicht aus `{name}` und
  `{server}` und nicht aus der Vorlage, weder im Text noch im Banner. Bleibt
  vom Anzeigenamen nichts, steht dort der Benutzername. Welche Zeichen das
  sind, steht in Entscheidung
  [0018](../entscheidungen/0018-zierbuchstaben-und-filter.md).
- Beim Beitritt pingt nur die Erwähnung des neuen Mitglieds. Die Nachricht
  erlaubt nur diese eine Erwähnung (`allowed_mentions` mit genau dieser ID);
  `@everyone`, `@here` und Rollen pingen nie, auch wenn sie im Text stehen.
  Beim Abschied pingt nichts. Beleg:
  [Allowed Mentions](https://docs.discord.com/developers/resources/message#allowed-mentions-object).

## Banner

Das Banner ist ein PNG mit 1100 × 440 px, das der Bot bei jedem Ereignis
neu zeichnet:

- Hintergrund: das hochgeladene Bild, auf die Fläche skaliert und mittig
  beschnitten. Das geschieht einmal beim Hochladen; gespeichert wird nur das
  Ergebnis mit 1100 × 440 px, neu kodiert und ohne Metadaten. So trägt
  kein Bild den Ort der Aufnahme, und ein Banner muss kein grosses Bild
  dekodieren.
- Darüber ein dunkler Schleier, damit die Schrift lesbar bleibt.
- In der Mitte der Avatar des Mitglieds, rund, 200 px, mit hellem Rand.
  Hat das Mitglied keinen, der Standard-Avatar von Discord; antwortet das
  CDN nicht, ein leerer Kreis.
- Darunter `bannerText` mit Platzhaltern, in einer Zeile. Die Schrift wird
  von 64 px bis 32 px kleiner, bis der Text passt; sonst endet er mit „…“.
- Dateiname `beitritt.png` oder `abschied.png`.

Die Schriften liegen als Dateien im Repository, weil auf einem Server oft
keine Schrift installiert ist. Sie stehen unter der SIL Open Font License
1.1, ihre Lizenztexte liegen daneben; das hat der Maintainer so
entschieden (Regel 27). Der Text steht in Inter SemiBold, siehe
Entscheidung [0009](../entscheidungen/0009-banner-mit-napi-rs-canvas.md).
Zeichen, die Inter nicht hat, kommen aus Noto Color Emoji, farbig, und aus
Noto Sans CJK für Chinesisch, Japanisch und Koreanisch, siehe Entscheidung
[0010](../entscheidungen/0010-ersatzschriften-im-banner.md).

Ein Kästchen zeichnet das Banner nie, siehe Entscheidung
[0018](../entscheidungen/0018-zierbuchstaben-und-filter.md):

- Hat keine der Schriften ein Zeichen, zeichnet es seine Form nach NFKC:
  „𝕿𝖊𝖘𝖙“, „𝔗𝔢𝔰𝔱“ und „𝓣𝓮𝓼𝓽“ werden „Test“.
- Hat auch diese Form keine Glyphe, fällt das Zeichen weg. Bleibt so vom
  Namen nichts, etwa bei einem Namen ganz in Arabisch, Hebräisch, Thai oder
  Devanagari, steht im Banner der Benutzername.
- Was eine Schrift hat, bleibt, wie es ist, auch Ｔ oder Ⓣ, Emoji mit ZWJ,
  Hautton und Flaggen. Im Text der Begrüssung ändert sich nichts.

## Standardwerte

Ohne gespeicherte Einstellung gilt:

| Feld | Beitritt | Abschied |
|---|---|---|
| `an` | `false` | `false` |
| `kanal` | `null` | `null` |
| `text` | `Willkommen auf {server}, {nutzer}!` | `{name} hat den Server verlassen.` |
| `banner` | `false` | `false` |
| `bannerText` | `Willkommen, {name}!` | `Tschüss, {name}!` |

## Rechte und Intent

Den Intent `GuildMembers` und das Partial begründet [Intents](../bot/intents.md);
dort steht auch, in welcher Reihenfolge der Intent kommt. Im gewählten
Kanal braucht der Bot diese Rechte:

| Recht | Wofür |
|---|---|
| „Kanal ansehen“ | den Kanal finden |
| „Nachrichten senden“ | die Nachricht |
| „Dateien anhängen“ | das Banner |

Beleg: [Permissions](https://docs.discord.com/developers/topics/permissions).

## Bremse

Treten in kurzer Zeit viele bei, etwa bei einem Raid, schickt der Bot
nicht jede Begrüssung einzeln. Sonst flutete er den Kanal, zeichnete
Hunderte Banner und liefe in die Rate-Limits von Discord. Je Server und
Art zählt er die Ereignisse der letzten 10 s:

1. Bis 5 Ereignisse in 10 s geht jede Begrüssung wie eingestellt.
2. Ab dem 6. Ereignis in 10 s greift die Bremse. Dann gehen keine einzelnen
   Nachrichten und keine Banner mehr; der Bot zählt nur noch.
3. Kommt 30 s lang kein Ereignis dieser Art, löst sich die Bremse. Der Bot
   schickt dann eine zusammenfassende Nachricht, ohne Ping und ohne Banner,
   in den eingestellten Kanal, wenn die Art noch an ist und er dort darf.

| Art | eins | mehrere |
|---|---|---|
| Beitritt | `Willkommen an das neue Mitglied!` | `Willkommen an die {zahl} neuen Mitglieder!` |
| Abschied | `1 Mitglied hat den Server verlassen.` | `{zahl} Mitglieder haben den Server verlassen.` |

- `{zahl}` zählt die Ereignisse, die nicht einzeln begrüsst wurden, also
  ab dem 6. Ereignis.
- Die Bremse zählt nur, solange die Art an ist. Sonst könnte ein Raid bei
  ausgeschalteter Begrüssung sie anwerfen; schaltet das Team danach ein,
  begrüsste die Zusammenfassung Mitglieder, die nie begrüsst werden
  sollten.
- Die Bremse lebt im Speicher des Prozesses. Ein Neustart setzt sie
  zurück, und eine Zusammenfassung, die noch aussteht, fällt dann weg.
- Ins Log kommen „Bremse an“ und „Bremse aus“ mit der Zahl, ohne IDs und
  Namen.
- Testnachrichten aus dem Dashboard zählen nicht, siehe
  [API der Begrüssung](../schnittstelle/begruessung.md), „Testnachricht“.

## Wenn etwas fehlt

- Ist die Begrüssung aus, schickt er nichts, ohne Logzeile.
- Fehlt der Kanal oder darf der Bot dort nicht sehen oder senden, schickt
  er nichts. Ins Log kommt eine Zeile ohne IDs und Namen.
- Scheitert das Banner oder fehlt im Kanal „Dateien anhängen“, geht nur der
  Text, mit einer Logzeile. Ist der Text dann leer, geht nichts.
- Verlässt der Bot einen Server, löscht er dessen Einstellungen und Bilder
  (`guildDelete`).
- Beim Start löscht er Einstellungen und Bilder der Server, die nicht in
  seiner Liste aus `READY` stehen. So gehen auch die Daten weg, wenn der Bot
  entfernt wurde, während er aus war. Ein Ausfall bei Discord löscht nichts:
  Ein nicht verfügbarer Server steht trotzdem in der Liste, und discord.js
  meldet dann `guildUnavailable` statt `guildDelete`.

## Was noch fehlt

- Eigene Schwellen und ein eigener Text für die Bremse, je Server im
  Dashboard.
