---
title: "0009: Banner mit @napi-rs/canvas und Inter"
description: Warum der Bot Bilder und Banner mit @napi-rs/canvas 1.0.10 zeichnet, statt mit sharp, node-canvas oder reinem JavaScript; welche Lizenzen die Binärdatei mitbringt; warum WebP für gespeicherte Bilder und Inter als Schrift.
status: gilt
date: 2026-10-11
issues: []
code:
  - bot/package.json
  - bot/src/banner.ts
  - bot/schrift/Inter-SemiBold.ttf
  - bot/schrift/OFL.txt
  - NOTICE
---

# 0009: Banner mit @napi-rs/canvas und Inter

## Anlass

Bei Beitritt und Abschied schickt der Bot ein Banner aus einem Bild, das
das Team hochlädt, siehe [Begrüssung bei Beitritt und Abschied](../benutzung/begruessung.md),
„Banner“. Dafür muss er PNG, JPEG und WebP lesen, zuschneiden, Text mit
einer Schrift setzen und PNG und WebP schreiben. Node kann davon nichts
selbst. Der Maintainer hat die Bibliothek mit ihren Lizenzhinweisen
erlaubt (`AGENTS.md`, Regel 27).

## Entscheidung

- **Bibliothek:** `@napi-rs/canvas` 1.0.10 (MIT), exakt gepinnt, in
  `package.json` ohne `^`. 1.0.11 erschien am 2026-10-10, einen Tag vor
  dieser Entscheidung; eine so junge Version ist das grössere Risiko für
  die Lieferkette. Ein `npm install` hebt die Version so nicht still.
  Die API ist die des Canvas im Browser; `new Image()` liest die Masse aus
  dem Kopf, ohne zu dekodieren, und `loadImage` wendet die EXIF-Drehung
  an. Beides ist mit Tests belegt.
- **Gespeicherte Bilder:** WebP, verlustbehaftet, Qualität 85, nach dem
  Zuschnitt auf 1100 × 440 px. Gemessen an drei Fotos mit 3840 × 2160 px,
  zugeschnitten auf 1100 × 440:

  | Format | Grösse |
  |---|---|
  | PNG | 374 bis 611 KiB |
  | JPEG, Qualität 85 | 58 bis 81 KiB |
  | WebP, Qualität 75 | 28 bis 36 KiB |
  | WebP, Qualität 85 | 42 bis 55 KiB |
  | WebP, Qualität 90 | 53 bis 74 KiB |

  WebP 85 ist rund zehnmal kleiner als PNG und kleiner als JPEG bei
  gleicher Qualität. Das Bild ist nur Hintergrund unter einem Schleier;
  kleine Verluste sieht niemand. Das Banner selbst geht als PNG raus, wie
  die Doku es verlangt.
- **Schrift:** Inter 4.1 SemiBold, `bot/schrift/Inter-SemiBold.ttf`,
  unverändert und nicht zugeschnitten, mit dem Lizenztext als
  `bot/schrift/OFL.txt`. Geladen von der Veröffentlichung des Projekts,
  `Inter-4.1.zip` aus `github.com/rsms/inter`, Datei
  `extras/ttf/Inter-SemiBold.ttf`, SHA-256
  `78a843fade9d4612a5567302fb595b56976eb5fcebf4fea5a5912d638bafcde3`.
  Lizenz SIL Open Font License 1.1, Copyright 2016 The Inter Project
  Authors; ein Reserved Font Name ist nicht genannt. Inter steht als erste
  Schrift in `--sans` des Design-Guides und deckt Latein, Griechisch,
  Kyrillisch und Vietnamesisch ab. Für Namen ist die Abdeckung wichtiger als
  die Nähe zu Georgia in den Überschriften der Website.

## Lizenzen in der Binärdatei

Das Plattform-Paket (`@napi-rs/canvas-linux-x64-gnu`,
`@napi-rs/canvas-win32-x64-msvc` und andere) bringt Skia und Rust-Crates
als eine Binärdatei mit. Die Lizenzprüfung der CI sieht nur das Feld
`license` des Pakets, MIT. Was darin steckt, sagt die CycloneDX-SBOM
`sbom.cdx.json` im Paket. 1.0.10 hat noch keine; sie kam mit 1.0.11
(„feat: emit CycloneDX SBOMs for platform packages“). Zwischen den Tags
`v1.0.10` und `v1.0.11` sind das Skia-Submodul (`95ee33d`) und
`Cargo.lock` (`c9ff6d7`) gleich. Die SBOM von 1.0.11 beschreibt also
dieselben Bestandteile. Gelesen aus den Paketen für `linux-x64-gnu` und
`win32-x64-msvc`, beide gleich, 107 Bestandteile:

| Lizenz | Bestandteile | Hinweis nötig |
|---|---|---|
| FTL | freetype | ja, Satz in `NOTICE` |
| BSD-3-Clause AND IJG AND Zlib | libjpeg-turbo | ja, Satz zur IJG in `NOTICE` |
| ICU | icu | ja, Copyright in `NOTICE` |
| MPL-2.0 | cssparser, cssparser-color, cssparser-macros, dtoa-short | ja, Satz zur Quelle in `NOTICE`; wir ändern die Dateien nicht |
| BSD-3-Clause, BSD-2-Clause | libwebp, libjxl, libavif, libaom | in `NOTICE` genannt |
| Apache-2.0 | highway, wuffs | in `NOTICE` genannt |
| libpng-2.0, Zlib | libpng, zlib | nur bei Quelltext |
| MIT, ISC, Unlicense, Unicode-3.0, jeweils auch mit Apache-2.0 | harfbuzz, expat, brotli und 86 Rust-Crates | in `NOTICE` genannt |

Das Repository verteilt die Binärdatei nicht; `npm` lädt sie. Die Hinweise
stehen trotzdem in `NOTICE`, so wie es der Maintainer verlangt hat. Die
Liste kommt aus der SBOM, Regel 26 gilt: Das sind Lizenzhinweise, keine
Vorbilder.

## Verworfene Alternativen

- **sharp.** `sharp` selbst steht unter Apache-2.0. Die vorgebauten
  `@img/sharp-libvips-*` stehen aber unter `LGPL-3.0-or-later`, die
  `@img/sharp-win32-*` unter `Apache-2.0 AND LGPL-3.0-or-later`. Die
  Lizenzprüfung der CI würde rot (`AGENTS.md`, Regel 27). Text setzen
  kann sharp ausserdem nur über SVG.
- **node-canvas (`canvas`).** Dieselbe API, aber auf Cairo, Pango und
  deren Abhängigkeiten. Ohne passende Binärdatei baut es mit node-gyp und
  braucht Bibliotheken des Systems; das ist mehr Aufwand auf dem Server
  und in der CI.
- **Reines JavaScript.** PNG schreiben geht mit `node:zlib`, aber JPEG und
  WebP dekodieren, skalieren und eine TrueType-Schrift setzen hiesse, einen
  Rasterer und einen Textsatz selbst zu schreiben. Für ein Banner steht das
  in keinem Verhältnis.
- **Gelasio als Schrift.** Hat die Masse von Georgia aus den Überschriften
  der Website und steht auch unter OFL, deckt aber weniger Schriftsysteme
  ab als Inter.

## Folgen

- Rund 38 MB mehr in `node_modules` für die Binärdatei des eigenen
  Systems. Unter Linux braucht sie keine Bibliotheken des Systems, nur
  glibc 2.18 oder musl mit eigenem Paket.
- Ein Update von `@napi-rs/canvas` ist eine bewusste Änderung an
  `package.json` und an dieser Entscheidung, mit neuem Blick in die SBOM.
- Emoji und CJK hat Inter nicht; im Banner werden sie zu Kästchen, siehe
  [API im Bot](../bot/dashboard-api.md), „Was noch fehlt“.
