---
title: "0018: Zierbuchstaben im Banner nach NFKC, Hakenkreuze und SS-Runen gefiltert"
description: Warum das Banner Zeichen ohne Glyphe über die cmap der Schriften erkennt und durch ihre Form nach NFKC ersetzt oder weglässt, und warum der Bot Hakenkreuze und SS-Runen nie schreibt, weder in der Begrüssung noch im Banner noch im Namen eines Sprachraums.
status: gilt
date: 2026-10-12
issues: [55]
code:
  - bot/src/module/begruessung/glyphen.ts
  - bot/src/module/begruessung/banner.ts
  - bot/src/module/begruessung/senden.ts
  - bot/src/kern/namen.ts
  - bot/src/discord/nachrichten.ts
  - bot/src/module/sprachraeume/raeume.ts
  - bot/src/module/sprachraeume/knoepfe.ts
---

# 0018: Zierbuchstaben im Banner nach NFKC, Hakenkreuze und SS-Runen gefiltert

Ändert [0010](0010-ersatzschriften-im-banner.md) unter „Folgen“: Ein
Zeichen, das keine der drei Schriften hat, wird im Banner kein Kästchen
mehr.

## Anlass

Issue #55. Manche Mitglieder schreiben ihren Namen mit Zierbuchstaben aus
dem Block Mathematical Alphanumeric Symbols (U+1D400 bis U+1D7FF), etwa
„𝕿𝖊𝖘𝖙“. Keine der drei Schriften hat diese Zeichen; im Banner wurde jedes
zu einem Kästchen. 0010 nahm Kästchen hin und dachte an seltene Schriften,
auf Discord sind solche Namen aber häufig. Dazu will der Maintainer, dass
der Bot Hakenkreuze und SS-Runen nie schreibt, auch wenn sie im Namen
eines Mitglieds oder Servers stehen.

## Entscheidung

### Zeichen ohne Glyphe im Banner

`bot/src/module/begruessung/glyphen.ts` liest beim Laden von `banner.ts`
aus jeder der drei Schriften nur das Verzeichnis der Tabellen und die
`cmap`, Format 12 (3/10, sonst 0/4 oder 0/6). Fehlt sie, wirft schon das
Laden, statt still alles zu ersetzen.

| Schrift | Grösse der `cmap` | Bereiche |
|---|---|---|
| Inter SemiBold | 26 KB | 1680 |
| Noto Color Emoji | 6 KB | 344 |
| Noto Sans CJK JP Bold | 257 KB | 15 286 |

Zusammengelegt sind das etwa 140 KB im Speicher, gelesen und gebaut in
unter 10 ms, lokal gemessen. Ob eine Schrift
ein Zeichen hat, sagt eine binäre Suche.

`zeichenbar` macht aus einem Text, was das Banner zeichnen kann,
Codepunkt für Codepunkt:

| Zeichen | im Banner |
|---|---|
| eine der Schriften hat es | bleibt, wie es ist, auch Ｔ (Noto Sans CJK) und Ⓣ (Inter) |
| `\p{Default_Ignorable_Code_Point}`: ZWJ, VS16, Tags, Bidi-Steuerzeichen | bleibt; HarfBuzz zeichnet es nicht |
| sonst | seine Form nach NFKC, Zeichen für Zeichen nur, was eine Schrift hat: 𝕿 wird T |
| auch die Form nach NFKC hat keine Glyphe | fällt weg, etwa U+16CB, Arabisch oder ein Vokalzeichen aus Devanagari |

- Hautton, Regionalbuchstaben für Flaggen und U+20E3 für Tasten sind
  keine Default Ignorables, stehen aber in der `cmap` von Noto Color
  Emoji. Emoji mit ZWJ, Hautton, Flaggen und Tasten bleiben also, wie sie
  sind.
- Das Banner wendet `zeichenbar` zuerst auf `{name}` und `{server}` an,
  danach auf die ganze Zeile, also auch auf Text aus der Vorlage. Bleibt
  von `{name}` nichts, etwa bei einem Namen ganz in Arabisch, Hebräisch,
  Thai oder Devanagari, steht dort der Benutzername. Sonst stünde im
  Banner „Willkommen, !“.
- Der Text der Begrüssung ändert sich nicht; ihn zeichnet Discord selbst.

### Hakenkreuze und SS-Runen

Diese Zeichen schreibt der Bot nie:

- Hakenkreuze: U+534D, U+5350, U+0FD5 bis U+0FD8.
- SS-Runen: jede Folge aus mindestens zwei Zeichen aus U+16CB ᛋ, U+16CA ᛊ
  und U+03DF ϟ, auch gemischt. Unsichtbare Zeichen dazwischen
  (`\p{Default_Ignorable_Code_Point}`, etwa ZWJ) zählen nicht. Ein
  einzelnes Zeichen bleibt.
- Erst fallen die Hakenkreuze, dann die Runen: Aus Rune, Hakenkreuz, Rune
  wird so ein Paar, das dann auch fällt.

`ohneHasszeichen` in `bot/src/kern/namen.ts` filtert; der Kern ist die
Stelle, die Begrüssung und Sprachräume beide nutzen dürfen. Er läuft
zweimal:

1. Auf den Werten von `{name}` und `{server}`; `{nutzer}` im Banner ist
   `@` und der Name, gilt also mit. Bleibt vom Namen nichts zu sehen,
   nimmt `nameOder` den Benutzernamen, das neue Feld `benutzername` von
   `Mitglied` aus `alsMitglied`. Er hat nur a–z, 0–9, `_` und `.`
   ([Users](https://docs.discord.com/developers/resources/user)).
2. Auf dem Ergebnis: dem Text der Begrüssung und der Zeile des Banners
   nach dem Einsetzen, dem fertigen Namen eines neuen Sprachraums und dem
   neuen Namen beim Umbenennen im Menü. So fängt der Filter auch eine
   Vorlage, die ein Admin geschrieben hat.

Bleibt vom Namen eines neuen Raums nichts, heisst er wie der Besitzer.
Bleibt beim Umbenennen nichts, gibt der Bot den Hinweis, den es schon für
einen leeren Namen gibt.

## Verworfene Alternativen

- **Jedes Zeichen allein zeichnen und mit dem Kästchen vergleichen**, mit
  einem Cache je Codepunkt. Teurer beim ersten Banner und hängt an der
  Prüfsumme eines Kästchens. Der Vergleich bleibt als Test, der die `cmap`
  gegen das Zeichnen prüft.
- **Eine Bibliothek, die Schriften liest.** Mit `node:fs` und `Buffer`
  sind es rund 40 Zeilen (`AGENTS.md`, Regel 23).
- **NFKC auf den ganzen Text.** Das änderte auch Zeichen, die eine Schrift
  hat, etwa Ｔ, ﬁ, ² oder ™.
- **Immer behalten: Cf, Mn, Mc, Me, Emoji_Component und
  Extended_Pictographic.** Ein Mn ohne Glyphe, etwa ein Vokalzeichen aus
  Devanagari, oder ein Pictographic ohne Glyphe wäre wieder ein Kästchen.
- **Neue Schriften für weitere Schriftsysteme.** Will der Maintainer nicht.
- **SS-Runen nur als gleiches Paar.** Gemischt oder mit ZWJ dazwischen
  wäre der Filter leicht zu umgehen.
- **Nur die Werte filtern.** Dann schriebe der Bot ein Hakenkreuz, das ein
  Admin in die Vorlage setzt.

## Folgen

- Im Banner gibt es kein Kästchen mehr. Namen in einem Schriftsystem, für
  das keine Schrift im Repository liegt, fehlen im Banner; dort steht der
  Benutzername. Im Text der Begrüssung bleiben sie.
- Ein einzelnes U+16CB bleibt im Text und im Namen eines Raums, im Banner
  fällt es weg, weil keine Schrift es hat.
- Beim Laden von `banner.ts` drei kleine Lesezugriffe und rund 140 KB im
  Speicher. Kommt eine neue Version einer Schrift, gilt ihre `cmap` von
  selbst.
- Der Filter gilt nur, wo der Bot selbst schreibt. Was Mitglieder
  schreiben, ändert er nicht.
