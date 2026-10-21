import assert from 'node:assert/strict';
import { test } from 'node:test';
import { alsAuswahl, alsModal, alsNachricht } from './menue.js';
import { auswahl, formular, menue } from '../module/sprachraeume/menue.js';

// Wie die Discord-Schicht Menü, Auswahl und Formular des Moduls Sprachräume
// zu Components macht, ohne Netz. Siehe docs/entwicklung/tests.md, „Das Menü der Sprachräume“.

test('das Menü: Text, drei Reihen mit je vier Knöpfen, rot nur Rauswerfen und Bannen, ohne Erwähnungen', () => {
  const n = alsNachricht(menue());
  assert.match(String(n.content), /^## Dein Sprachraum\n/);
  assert.deepEqual(n.allowedMentions, { parse: [] });
  const reihen = (n.components ?? []).map((r) => (r as { toJSON(): { type: number; components: { type: number; custom_id: string; label: string; style: number }[] } }).toJSON());
  assert.deepEqual(
    reihen.map((r) => [r.type, r.components.length]),
    [
      [1, 4],
      [1, 4],
      [1, 4],
    ],
  );
  const knoepfe = reihen.flatMap((r) => r.components);
  assert.ok(knoepfe.every((k) => k.type === 2 && k.custom_id.startsWith('sprachraum:')));
  assert.deepEqual(
    knoepfe.filter((k) => k.style === 4).map((k) => k.custom_id),
    ['sprachraum:rauswerfen', 'sprachraum:bannen'],
  );
  assert.ok(knoepfe.filter((k) => k.style !== 4).every((k) => k.style === 2));
});

test('jeder Knopf trägt sein Emoji als Unicode ohne ID, in der Reihenfolge des Menüs; bei vieren mit U+FE0F', () => {
  const reihen = (alsNachricht(menue()).components ?? []).map((r) => (r as { toJSON(): { components: { custom_id: string; emoji?: { name?: string; id?: string; animated?: boolean } }[] } }).toJSON());
  const knoepfe = reihen.flatMap((r) => r.components);
  // Unicode: ohne ID, nicht animiert.
  assert.ok(knoepfe.every((k) => k.emoji !== undefined && k.emoji.id === undefined && k.emoji.animated === false));
  assert.deepEqual(
    knoepfe.map((k) => [k.custom_id, k.emoji?.name]),
    [
      ['sprachraum:sperren', '🔒'],
      ['sprachraum:entsperren', '🔓'],
      ['sprachraum:verstecken', '👻'],
      ['sprachraum:zeigen', '👁\uFE0F'],
      ['sprachraum:umbenennen', '✏\uFE0F'],
      ['sprachraum:limit', '👥'],
      ['sprachraum:uebernehmen', '👑'],
      ['sprachraum:info', 'ℹ\uFE0F'],
      ['sprachraum:rauswerfen', '👢'],
      ['sprachraum:bannen', '🔨'],
      ['sprachraum:entbannen', '🕊\uFE0F'],
      ['sprachraum:uebergeben', '🤝'],
    ],
  );
});

test('die Auswahl: die Frage und genau ein Mitglied', () => {
  const a = alsAuswahl(auswahl('bannen'));
  assert.equal(a.content, 'Wen willst du bannen?');
  assert.deepEqual(a.components[0]?.toJSON().components[0], {
    type: 5,
    custom_id: 'sprachraum:bannen',
    placeholder: 'Mitglied wählen',
    min_values: 1,
    max_values: 1,
  });
});

test('das Formular: Label (Typ 18) mit einem Textfeld wert, vorbelegt', () => {
  const json = alsModal(formular('limit', { name: 'Mias Raum', limit: 4 })).toJSON();
  assert.deepEqual(json, {
    custom_id: 'sprachraum:limit',
    title: 'Limit des Raums',
    components: [
      {
        type: 18,
        label: 'Höchstens so viele im Raum',
        description: '0 bis 99; 0 heisst unbegrenzt',
        component: { type: 4, custom_id: 'wert', style: 1, required: true, min_length: 1, max_length: 2, value: '4' },
      },
    ],
  });
  assert.match(JSON.stringify(alsModal(formular('umbenennen', { name: 'Mias Raum', limit: 4 })).toJSON()), /"max_length":100,"value":"Mias Raum"/);
});
