import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createCanvas } from '@napi-rs/canvas';
import { schriftStapel, zeichenbar } from './banner.js';
import { bereicheAus, Glyphen, leseBereiche } from './glyphen.js';

// Zeichen ohne Kästchen im Banner, über die cmap der Schriften.
// Siehe docs/entscheidungen/0018-zierbuchstaben-und-filter.md.

// Die Pixel von `text` in 64 px als Prüfsumme, und ob überhaupt Tinte da ist.
function pixel(text: string): { summe: string; tinte: boolean } {
  const flaeche = createCanvas(400, 120);
  const g = flaeche.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 400, 120);
  g.fillStyle = '#000000';
  g.font = `64px ${schriftStapel}`;
  g.textBaseline = 'middle';
  g.fillText(text, 10, 60);
  const daten = g.getImageData(0, 0, 400, 120).data;
  return { summe: createHash('sha256').update(daten).digest('hex'), tinte: daten.some((wert, i) => i % 4 !== 3 && wert < 250) };
}

test('zeichenbar: Zierbuchstaben ohne Glyphe werden nach NFKC zu Buchstaben, ohne Kästchen', () => {
  assert.equal(zeichenbar('𝕿𝖊𝖘𝖙'), 'Test');
  assert.equal(zeichenbar('𝔗𝔢𝔰𝔱 𝓣𝓮𝓼𝓽'), 'Test Test');
  assert.equal(pixel(zeichenbar('𝕿𝖊𝖘𝖙')).summe, pixel('Test').summe);
  // Ungeändert hätte das Banner Kästchen gezeichnet.
  assert.notEqual(pixel('𝕿𝖊𝖘𝖙').summe, pixel('Test').summe);
});

test('zeichenbar: was eine Schrift hat, bleibt, auch Emoji mit ZWJ, Hautton, Flaggen, Tasten, Kanji und Hangul', () => {
  for (const text of ['Ｔ', 'Ⓣ', 'ﬁ', '😀', '👩\u200D👩\u200D👧', '👍🏽', '🇩🇪', '🏴󠁧󠁢󠁳󠁣󠁴󠁿', '1\uFE0F⃣', '漢字', '汉', 'あ', '한글', 'Mia ü ß']) {
    assert.equal(zeichenbar(text), text, text);
  }
});

test('zeichenbar: ohne Glyphe und ohne Ersatz fällt ein Zeichen weg, auch ein Vokalzeichen; unsichtbare bleiben', () => {
  // \u16CB, Arabisch, Devanagari mit Vokalzeichen (Mn), ein nicht vergebener Codepunkt.
  assert.equal(zeichenbar('A\u16CBB'), 'AB');
  assert.equal(zeichenbar('Mia \u0627\u0628\u062A'), 'Mia ');
  assert.equal(zeichenbar('A\u0915\u093FB'), 'AB');
  assert.equal(zeichenbar('A\u0378B'), 'AB');
  assert.equal(zeichenbar('A\u200D\u200F\u2066\uFE0FB'), 'A\u200D\u200F\u2066\uFE0FB');
});

test('unsichtbare Zeichen zeichnet das Banner nicht: kein Kästchen, keine Breite', () => {
  const ab = pixel('AB').summe;
  for (const zeichen of ['\u200D', '\u200F', '\u2066', '\u2069', '\uFE0F', '\u00AD', '\u034F', '\u200B', '\u2060']) {
    assert.equal(pixel(`A${zeichen}B`).summe, ab, `U+${(zeichen.codePointAt(0) ?? 0).toString(16)}`);
  }
});

test('die cmap sagt dasselbe wie das Zeichnen: Glyphe heisst kein Kästchen', () => {
  // U+0378 ist nicht vergeben; dafür zeichnet der Stapel sein Kästchen.
  const kaestchen = pixel('\u0378').summe;
  for (const zeichen of ['M', 'ü', '😀', '🏽', '🇩', '漢', '한', 'Ｔ', 'Ⓣ', 'ﬁ', '\u5350', '𝕿', '\u16CB', '\u0915', '\u0627', '\u0FD5']) {
    const { summe, tinte } = pixel(zeichen);
    const gezeichnet = tinte && summe !== kaestchen;
    assert.equal(zeichenbar(zeichen) === zeichen, gezeichnet, `U+${(zeichen.codePointAt(0) ?? 0).toString(16)}`);
  }
});

test('Glyphen legt die Bereiche der Schriften zusammen und sucht binär', () => {
  const g = new Glyphen([[[1, 3]], [[2, 5], [10, 10]], []]);
  assert.deepEqual(
    [0, 1, 4, 5, 6, 9, 10, 11].map((z) => g.hat(z)),
    [false, true, true, true, false, false, true, false],
  );
});

// Eine cmap mit einer Untertabelle `format` für 3/`kodierung`; bei Format 12 mit `gruppen`.
function cmap(format: number, kodierung: number, gruppen: [number, number, number][] = []): Buffer {
  const kopf = Buffer.alloc(12);
  kopf.writeUInt16BE(1, 2);
  kopf.writeUInt16BE(3, 4);
  kopf.writeUInt16BE(kodierung, 6);
  kopf.writeUInt32BE(12, 8);
  const tabelle = Buffer.alloc(16 + 12 * gruppen.length);
  tabelle.writeUInt16BE(format, 0);
  tabelle.writeUInt32BE(gruppen.length, 12);
  for (const [i, [von, bis, glyphe]] of gruppen.entries()) {
    tabelle.writeUInt32BE(von, 16 + 12 * i);
    tabelle.writeUInt32BE(bis, 20 + 12 * i);
    tabelle.writeUInt32BE(glyphe, 24 + 12 * i);
  }
  return Buffer.concat([kopf, tabelle]);
}

test('bereicheAus liest Format 12; Glyphe 0 am Anfang zählt nicht; ohne Format 12 wirft es', () => {
  assert.deepEqual(
    bereicheAus(cmap(12, 10, [
      [0x41, 0x5a, 5],
      [0x20, 0x20, 0],
      [0x30, 0x39, 0],
    ])),
    [
      [0x41, 0x5a],
      [0x31, 0x39],
    ],
  );
  assert.throws(() => bereicheAus(cmap(4, 1)), /keine cmap im Format 12/);
  // Format 12 nur für 3/1 zählt nicht.
  assert.throws(() => bereicheAus(cmap(12, 1, [[0x41, 0x5a, 5]])), /keine cmap im Format 12/);
});

test('leseBereiche wirft beim Laden für eine Schrift ohne cmap im Format 12 und nennt die Datei', (t) => {
  const ordner = mkdtempSync(join(tmpdir(), 'kitty-schrift-'));
  t.after(() => rmSync(ordner, { recursive: true, force: true }));
  // Eine Datei mit Kopf, einem Eintrag `cmap` und einer cmap nur im Format 4.
  const tabelle = cmap(4, 1);
  const kopf = Buffer.alloc(28);
  kopf.writeUInt32BE(0x00010000, 0);
  kopf.writeUInt16BE(1, 4);
  kopf.write('cmap', 12, 'latin1');
  kopf.writeUInt32BE(28, 20);
  kopf.writeUInt32BE(tabelle.length, 24);
  const pfad = join(ordner, 'ohne-format-12.ttf');
  writeFileSync(pfad, Buffer.concat([kopf, tabelle]));
  assert.throws(() => leseBereiche(pfad), /Schrift ohne-format-12\.ttf: keine cmap im Format 12/);

  const ohneCmap = join(ordner, 'ohne-cmap.ttf');
  writeFileSync(ohneCmap, Buffer.concat([Buffer.from(kopf).fill(0, 12, 16).fill('x', 12, 16), tabelle]));
  assert.throws(() => leseBereiche(ohneCmap), /Schrift ohne-cmap\.ttf: keine cmap/);
});
