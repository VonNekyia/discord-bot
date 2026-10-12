import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nameOder, ohneHasszeichen } from './namen.js';

// Der Filter ohne Discord. Siehe docs/entscheidungen/0018-zierbuchstaben-und-filter.md.
test('ohneHasszeichen: Hakenkreuze fallen, SS-Runen ab zwei, auch gemischt und mit unsichtbaren Zeichen dazwischen', () => {
  const faelle: [string, string][] = [
    ['Mi\u5350a', 'Mia'],
    ['\u534DMia\u534D', 'Mia'],
    ['a\u0FD5b\u0FD6c\u0FD7d\u0FD8', 'abcd'],
    ['Mia \u16CB\u16CB', 'Mia '],
    ['\u16CA\u16CA', ''],
    ['\u03DF\u03DF', ''],
    ['\u16CB\u16CA\u03DF', ''],
    ['\u16CB\u200D\u16CB', ''],
    ['\u16CB\uFE0F\u16CA', ''],
    // Erst die Hakenkreuze, dann die Runen: Hier entsteht ein Paar.
    ['\u16CB\u5350\u16CB', ''],
    // Ein einzelnes Zeichen bleibt, ebenso Runen mit Sichtbarem dazwischen.
    ['\u16CB', '\u16CB'],
    ['\u03DF', '\u03DF'],
    ['\u16CBa\u16CB', '\u16CBa\u16CB'],
    ['\u16CB \u16CB', '\u16CB \u16CB'],
    ['Mia 😀 漢字', 'Mia 😀 漢字'],
  ];
  for (const [ein, aus] of faelle) assert.equal(ohneHasszeichen(ein), aus, JSON.stringify(ein));
});

test('nameOder: der Benutzername, wenn vom Namen nichts zu sehen bleibt', () => {
  assert.equal(nameOder('Mia', 'nutzer.elf'), 'Mia');
  assert.equal(nameOder('', 'nutzer.elf'), 'nutzer.elf');
  assert.equal(nameOder(' \u200D\uFE0F ', 'nutzer.elf'), 'nutzer.elf');
  assert.equal(nameOder(ohneHasszeichen('\u5350\u534D'), 'nutzer.elf'), 'nutzer.elf');
});
