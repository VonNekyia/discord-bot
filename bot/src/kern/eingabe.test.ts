import assert from 'node:assert/strict';
import { test } from 'node:test';
import { istObjekt, ohneNul } from './eingabe.js';

test('istObjekt: nur ein Objekt mit Feldern, kein Array, nicht null', () => {
  assert.deepEqual(
    [{}, { a: 1 }, [], [1], null, undefined, 'x', 1, true].map(istObjekt),
    [true, true, false, false, false, false, false, false, false],
  );
});

test('ohneNul: nur ein Text ohne NUL', () => {
  assert.deepEqual(['', 'a', 'a\0b', '\0', 1, null, undefined, ['a']].map(ohneNul), [true, true, false, false, false, false, false, false]);
});
