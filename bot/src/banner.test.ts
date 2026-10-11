import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { createCanvas } from '@napi-rs/canvas';
import { masse, schriftStapel, zeichne } from './banner.js';
import { pngBild } from './testhilfe.js';

// U+0378 ist nicht vergeben; jede Schrift zeichnet dafür ihr Glyph für ein
// fehlendes Zeichen. Siehe docs/entwicklung/tests.md, „Was abgedeckt ist“.
const fehlt = '͸';

// Die Pixel eines Zeichens in 64 px als Prüfsumme, und ob überhaupt Tinte da ist.
function pixel(zeichen: string, schrift: string): { summe: string; tinte: boolean } {
  const flaeche = createCanvas(160, 120);
  const g = flaeche.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 160, 120);
  g.fillStyle = '#000000';
  g.font = `64px ${schrift}`;
  g.textBaseline = 'middle';
  g.fillText(zeichen, 10, 60);
  const daten = g.getImageData(0, 0, 160, 120).data;
  return { summe: createHash('sha256').update(daten).digest('hex'), tinte: daten.some((wert, i) => i % 4 !== 3 && wert < 250) };
}

test('ein Name mit Emoji, Kanji und Hangul zeigt kein Kästchen', () => {
  const kaestchen = pixel(fehlt, schriftStapel).summe;
  // Der Vergleich erkennt ein Kästchen: Inter allein hat kein Emoji.
  assert.equal(pixel('😀', 'Inter').summe, pixel(fehlt, 'Inter').summe);
  for (const zeichen of ['M', 'ü', '😀', '👍🏽', '🇩🇪', '漢', '汉', '这', 'あ', '한', '쌍']) {
    const { summe, tinte } = pixel(zeichen, schriftStapel);
    assert.ok(tinte, `${zeichen} ohne Tinte`);
    assert.notEqual(summe, kaestchen, `${zeichen} als Kästchen`);
  }
});

test('ein Banner mit Emoji und CJK im Namen hat 1100 × 440 px', async () => {
  const png = await zeichne(pngBild(1100, 440), undefined, 'Willkommen, Mia 😀 漢字 한글!');
  assert.deepEqual(masse(png), { breite: 1100, hoehe: 440 });
});
