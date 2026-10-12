import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DiscordAPIError, RateLimitError } from 'discord.js';
import { alsDiscordFehler, DiscordFehler, uebersetzt } from './fehler.js';

// Die eigenen Codes für Fehler von Discord, ohne Netz.
// Siehe docs/entwicklung/tests.md, „Die gemockte API“.
const apiFehler = (code: number) => new DiscordAPIError({ message: `Fehler ${code}`, code }, code, 400, 'PATCH', 'https://discord.example/api', {});

test('jeder Code, den ein Modul unterscheidet, hat seinen eigenen; die Meldung bleibt', () => {
  const faelle: [number, string][] = [
    [50001, 'kein_recht'],
    [50013, 'kein_recht'],
    [10003, 'nicht_gefunden'],
    [40032, 'nicht_verbunden'],
    [30060, 'zu_viele_eintraege'],
    [10007, 'anderes'],
    [30013, 'anderes'],
  ];
  for (const [code, eigener] of faelle) {
    const f = alsDiscordFehler(apiFehler(code));
    assert.deepEqual([f.code, f.message, f.warten], [eigener, `Fehler ${code}`, undefined], String(code));
  }
});

test('ein RateLimitError wird zu_schnell mit der Wartezeit; andere Fehler werden anderes', () => {
  const daten = { global: false, method: 'PATCH', url: 'https://discord.example/api', route: '/channels/:id', majorParameter: 'x', hash: 'h', limit: 2, timeToReset: 300_050, retryAfter: 300_050, sublimitTimeout: 300_050, scope: 'user' as const };
  const f = alsDiscordFehler(new RateLimitError(daten));
  assert.deepEqual([f.code, f.warten], ['zu_schnell', 300_050]);
  assert.equal(alsDiscordFehler(new Error('fetch failed')).code, 'anderes');
  assert.equal(alsDiscordFehler('kaputt').message, 'kaputt');
  const schon = new DiscordFehler('kein_recht', 'x');
  assert.equal(alsDiscordFehler(schon), schon);
});

test('uebersetzt wirft DiscordFehler und gibt sonst das Ergebnis', async () => {
  assert.equal(await uebersetzt(async () => 7), 7);
  await assert.rejects(
    uebersetzt(async () => {
      throw apiFehler(40032);
    }),
    (e: unknown) => e instanceof DiscordFehler && e.code === 'nicht_verbunden',
  );
});
