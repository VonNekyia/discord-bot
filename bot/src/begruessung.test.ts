import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ersetze, hoechstens, maskiere, pruefe, standard } from './begruessung.js';

const kanaele = new Map([
  ['500000000000000001', { banner: true }],
  ['500000000000000002', { banner: false }],
]);

// Eine Einstellung für den Beitritt mit Kanal, dazu `aenderung`.
function mit(aenderung: Record<string, unknown>): Record<string, unknown> {
  return { ...standard('beitritt'), kanal: '500000000000000001', ...aenderung };
}

test('hoechstens rechnet jeden Platzhalter mit seinem längsten Wert, in UTF-16', () => {
  assert.equal(hoechstens('{nutzer}{name}{server}{anzahl}', 'text'), 23 + 64 + 200 + 10);
  assert.equal(hoechstens('{nutzer}{name}{server}{anzahl}', 'banner'), 33 + 32 + 100 + 10);
  assert.equal(hoechstens('{name} und {name}', 'text'), 64 + 5 + 64);
  assert.equal(hoechstens('{Name} {unbekannt}', 'text'), '{Name} {unbekannt}'.length);
  assert.equal(hoechstens('😀', 'text'), 2);
});

test('der Text darf mit den längsten Werten genau 2000 Zeichen haben, das Banner 100', () => {
  const text = `{server}${'x'.repeat(1800)}`;
  assert.ok('einstellung' in pruefe(mit({ text }), kanaele, false));
  assert.deepEqual(pruefe(mit({ text: `${text}x` }), kanaele, false), { code: 'text_zu_lang', feld: 'text' });
  assert.deepEqual(pruefe(mit({ text: `😀${'x'.repeat(1999)}` }), kanaele, false), { code: 'text_zu_lang', feld: 'text' });
  const bannerText = `{nutzer}${'x'.repeat(67)}`;
  assert.ok('einstellung' in pruefe(mit({ bannerText }), kanaele, false));
  assert.deepEqual(pruefe(mit({ bannerText: `${bannerText}x` }), kanaele, false), {
    code: 'bannertext_zu_lang',
    feld: 'bannerText',
  });
});

test('jede Prüfregel meldet ihren Code und ihr Feld', () => {
  const faelle: [unknown, boolean, string, string][] = [
    [null, false, 'ungueltig', 'an'],
    [[], false, 'ungueltig', 'an'],
    [mit({ an: 'ja' }), false, 'ungueltig', 'an'],
    [mit({ kanal: 5 }), false, 'ungueltig', 'kanal'],
    [mit({ text: undefined }), false, 'ungueltig', 'text'],
    [mit({ text: 'a\0b' }), false, 'ungueltig', 'text'],
    [mit({ banner: 1 }), false, 'ungueltig', 'banner'],
    [mit({ bannerText: null }), false, 'ungueltig', 'bannerText'],
    [mit({ kanal: '500000000000000099' }), false, 'kanal_unbekannt', 'kanal'],
    [mit({ banner: true }), false, 'banner_ohne_bild', 'banner'],
    [mit({ banner: true, kanal: '500000000000000002' }), true, 'banner_ohne_recht', 'banner'],
    [mit({ banner: true, kanal: null }), true, 'banner_ohne_recht', 'banner'],
    [mit({ an: true, kanal: null }), false, 'an_ohne_kanal', 'an'],
    [mit({ an: true, text: ' \n ' }), false, 'an_ohne_inhalt', 'an'],
  ];
  for (const [eingabe, bild, code, feld] of faelle) {
    assert.deepEqual(pruefe(eingabe, kanaele, bild), { code, feld }, JSON.stringify(eingabe));
  }
});

test('die Regeln gelten in der Reihenfolge der Tabelle', () => {
  const alles = mit({ an: true, kanal: '500000000000000099', text: 'x'.repeat(2001), banner: true });
  assert.equal((pruefe(alles, kanaele, false) as { code: string }).code, 'kanal_unbekannt');
  assert.equal((pruefe({ ...alles, kanal: null }, kanaele, false) as { code: string }).code, 'text_zu_lang');
  assert.equal((pruefe({ ...alles, kanal: null, text: '' }, kanaele, false) as { code: string }).code, 'banner_ohne_bild');
});

test('eine gültige Einstellung kommt so zurück, wie sie gespeichert wird; bild zählt nicht als Eingabe', () => {
  const eingabe = mit({ an: true, banner: true, bild: false, fremd: 1 });
  assert.deepEqual(pruefe(eingabe, kanaele, true), {
    einstellung: { ...standard('beitritt'), an: true, kanal: '500000000000000001', banner: true, bild: true },
  });
  assert.deepEqual(pruefe(mit({ an: true, text: '', banner: true }), kanaele, true), {
    einstellung: { ...standard('beitritt'), an: true, kanal: '500000000000000001', text: '', banner: true, bild: true },
  });
});

test('maskiere setzt vor jedes ASCII-Satzzeichen genau einen Backslash', () => {
  assert.equal(maskiere('**Fett** <@1> `c` :e: # x_y ~z~ |s|'), String.raw`\*\*Fett\*\* \<\@1\> \`c\` \:e\: \# x\_y \~z\~ \|s\|`);
  assert.equal(maskiere('!'.repeat(32)).length, 64);
  assert.equal(maskiere('Jörg Ünal 名前 😀'), 'Jörg Ünal 名前 😀');
});

test('ersetze maskiert im Text, lässt das Banner roh und ersetzt jeden Platzhalter nur einmal', () => {
  const werte = { id: '200000000000000002', name: '*Max* {server}', server: 'Probe_Server', anzahl: 42 };
  assert.equal(
    ersetze('Hallo {nutzer}, {name} auf {server} ({anzahl}). {Name} {foo} {nutzer', werte, 'text'),
    String.raw`Hallo <@200000000000000002>, \*Max\* \{server\} auf Probe\_Server (42). {Name} {foo} {nutzer`,
  );
  assert.equal(ersetze('{nutzer} {name} {server}', werte, 'banner'), '@*Max* {server} *Max* {server} Probe_Server');
});
