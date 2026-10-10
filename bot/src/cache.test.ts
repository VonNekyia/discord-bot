import assert from 'node:assert/strict';
import { setTimeout as warte } from 'node:timers/promises';
import { test } from 'node:test';
import { ladeCache } from './cache.js';

test('gleichzeitige Anfragen laden einen Schlüssel nur einmal', async () => {
  let geladen = 0;
  const cache = ladeCache(async (id: string) => (geladen++, { id }));
  const werte = await Promise.all([cache.fetch('1'), cache.fetch('1'), cache.fetch('1')]);
  assert.equal(geladen, 1);
  assert.deepEqual(werte, [{ id: '1' }, { id: '1' }, { id: '1' }]);
});

test('nach delete und nach Ablauf wird neu geladen', async () => {
  let geladen = 0;
  const cache = ladeCache(async (id: string) => ({ id, stand: ++geladen }), { ttl: 30 });
  assert.equal((await cache.fetch('1'))?.stand, 1);
  assert.equal((await cache.fetch('1'))?.stand, 1);
  cache.delete('1');
  assert.equal((await cache.fetch('1'))?.stand, 2);
  await warte(60);
  assert.equal((await cache.fetch('1'))?.stand, 3);
});

test('mehr als max Schlüssel verdrängen den ältesten', async () => {
  const cache = ladeCache(async (id: string) => ({ id }), { max: 2 });
  await cache.fetch('1');
  await cache.fetch('2');
  await cache.fetch('3');
  assert.deepEqual([...cache.keys()].sort(), ['2', '3']);
});
