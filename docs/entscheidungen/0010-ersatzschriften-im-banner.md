---
title: "0010: Ersatzschriften im Banner für Emoji und CJK"
description: Warum das Banner Noto Color Emoji (COLRv1) und Noto Sans CJK JP Bold als Ersatz hinter Inter nutzt, mit 22 MB im Repository, statt Teilmengen, Variable Fonts oder einfarbiger Emoji.
status: gilt
date: 2026-10-11
issues: []
code:
  - bot/src/module/begruessung/banner.ts
  - bot/schrift/Noto-COLRv1.ttf
  - bot/schrift/Noto-Color-Emoji-OFL.txt
  - bot/schrift/NotoSansCJKjp-Bold.otf
  - bot/schrift/Noto-Sans-CJK-OFL.txt
  - NOTICE
---

# 0010: Ersatzschriften im Banner für Emoji und CJK

Löst [0009](0009-banner-mit-napi-rs-canvas.md) in einem Teil ab: Emoji
und CJK erscheinen im Banner nicht mehr als Kästchen.

## Anlass

Inter hat keine Emoji und keine chinesischen, japanischen oder
koreanischen Zeichen (CJK). In Namen kommen beide vor; im Banner wurden
sie zu Kästchen. Der Maintainer will Ersatzschriften und hat SIL OFL 1.1
erlaubt. Mehr als 15 MB im Repository entscheidet er selbst; er hat
22,07 MB gewählt.

## Entscheidung

`zeichne` in `bot/src/module/begruessung/banner.ts` setzt den Text mit der Liste
`Inter, "Noto Color Emoji", "Noto Sans CJK"`. Fehlt einer Schrift ein
Zeichen, nimmt `@napi-rs/canvas` die nächste, Zeichen für Zeichen.

| Datei | Schrift | Grösse | Quelle | SHA-256 |
|---|---|---|---|---|
| `Noto-COLRv1.ttf` | Noto Color Emoji 2.057, COLRv1, farbig, mit Flaggen | 5,04 MB | `googlefonts/noto-emoji`, Release `v2026-09-24-unicode18_0`, `2D/fonts/Noto-COLRv1.ttf` | `b8e25ea68db82f9e4d0aee921f4420be2be39887bd5c893a2ad98710531f9d0c` |
| `NotoSansCJKjp-Bold.otf` | Noto Sans CJK JP Bold 2.004, Pan-CJK: alle Zeichen für vereinfachtes und traditionelles Chinesisch, Japanisch und Koreanisch | 17,03 MB | `notofonts/noto-cjk`, Release `Sans2.004`, `Sans/OTF/Japanese/NotoSansCJKjp-Bold.otf` | `e53dcb0dcb2922e45d01aae1ebd2f382bb81d4229b18b6b883bd170678af1f76` |

- Beide Dateien sind unverändert und nicht zugeschnitten. Ihre Git-Blobs
  gleichen denen in den Release-Tags (`d1c8237…` und `d006db3…`).
- Beide stehen unter SIL OFL 1.1, Copyright 2022 Google Inc. und
  Copyright 2014–2021 Adobe; keine nennt einen Reserved Font Name. Die
  Lizenztexte liegen daneben, `Noto-Color-Emoji-OFL.txt` und
  `Noto-Sans-CJK-OFL.txt`, aus denselben Tags.
- Han-Zeichen haben in der JP-Datei die japanische Form. Für
  vereinfachtes Chinesisch sieht das ein Kenner, lesbar bleibt es.
- Bold kommt Inter SemiBold im Banner am nächsten.

Belegt mit Versuchen in `@napi-rs/canvas` 1.0.10:

- COLRv1 zeichnet farbig, auch Hautton mit ZWJ und Flaggen.
- Mit einer Liste von Familien greift der Ersatz Zeichen für Zeichen, und
  `measureText` misst mit ihm: Bei „Mia 😀 漢字 한글“ ergaben der ganze
  Text und die Summe der einzelnen Zeichen je 486,4 px. Das Verkleinern
  von 64 auf 32 px und das „…“ gelten also auch für Emoji und CJK.
- Aus Systemschriften ersetzt `@napi-rs/canvas` nichts. Mit nur `Inter`
  wird ein Emoji zu genau dem Glyph für ein fehlendes Zeichen, obwohl das
  System 75 Familien hatte. Das Banner hängt also nur an den Dateien im
  Repository, auf dem Server wie in der CI. Der Test „ein Name mit Emoji,
  Kanji und Hangul zeigt kein Kästchen“ prüft das.

## Verworfene Alternativen

- **Noto Color Emoji als CBDT** (10,73 MB). Sieht gleich aus, doppelt so
  gross.
- **COLRv1 ohne Flaggen** (3,04 MB). Flaggen stehen oft in Namen.
- **Noto Emoji, einfarbig** (1,98 MB, Variable Font). Emoji in Schwarz
  wirken im Banner fremd.
- **Teilmengen von Noto CJK** (JP 4,66 MB und KR 4,82 MB, zusammen mit
  den Emoji 14,52 MB, unter 15 MB). Vereinfachtes Chinesisch fehlte zum
  Teil; im Versuch wurden 汉 und 这 zu Kästchen. Die SC-Teilmenge allein
  hat 8,54 MB.
- **Variable Fonts von Noto CJK.** 30,7 MB je Region, grösser als eine
  statische Datei.
- **Eigene Teilmenge zuschneiden.** Namen können jedes Zeichen enthalten;
  eine Auswahl liesse wieder Lücken.

## Folgen

- 22,07 MB mehr im Repository, zusammen mit Inter 22,49 MB Schriften. Jede
  spätere neue Version einer dieser Schriften lässt die Git-Historie um
  dieselbe Grösse wachsen; der Maintainer weiss das und hat zugestimmt.
- Rund 22 MB mehr im Speicher des Bots, sobald `bot/src/module/begruessung/banner.ts` geladen
  ist.
- Zeichen, die keine der drei Schriften hat, etwa seltene historische
  Schriften, blieben Kästchen. Seit [0018](0018-zierbuchstaben-und-filter.md)
  zeichnet das Banner für sie die Form nach NFKC oder lässt sie weg; ein
  Kästchen gibt es nicht mehr.
