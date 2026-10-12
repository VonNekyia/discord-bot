import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Aufruf } from '../../discord/befehle.js';
import { befehle, type Kontext } from './befehle.js';

// Die Befehle ohne Discord: ein Aufruf, der nur die Antworten sammelt.
// Registrieren und Beantworten prüft bot/src/discord/befehle.test.ts.

// Eine Datenbank, die nur `query` kann: antwortet sofort oder wirft.
function datenbank(fehler?: Error): Kontext {
  return { db: { query: async () => { if (fehler) throw fehler; return [[], []]; } } as unknown as Kontext['db'] };
}

// Eine Datenbank, deren Anfragen nie zurückkommen.
function haengt(): Kontext {
  return { db: { query: () => new Promise(() => {}) } as unknown as Kontext['db'] };
}

// Ein Aufruf, der sich die Antworten merkt.
function aufruf() {
  const antworten: string[] = [];
  const a: Aufruf = { antworte: async (inhalt) => void antworten.push(inhalt) };
  return { a, antworten };
}

// Der Befehl /ping aus `befehle(kontext)`.
function ping(kontext: Kontext) {
  const b = befehle(kontext).find((x) => x.name === 'ping');
  assert.ok(b);
  return b;
}

test('befehle: nur /ping, mit Beschreibung', () => {
  assert.deepEqual(
    befehle(datenbank()).map((b) => [b.name, b.beschreibung]),
    [['ping', 'Prüft, ob Bot und Datenbank antworten.']],
  );
});

test('/ping antwortet mit der Zeit der Datenbank', async () => {
  const { a, antworten } = aufruf();
  await ping(datenbank()).ausfuehren(a);
  assert.equal(antworten.length, 1);
  assert.match(antworten[0] ?? '', /^Pong\. Datenbank: \d+ ms\.$/);
});

test('/ping antwortet auch, wenn die Datenbank fehlt', async (t) => {
  const log = t.mock.method(console, 'error', () => {});
  const { a, antworten } = aufruf();
  await ping(datenbank(new Error('connect ECONNREFUSED'))).ausfuehren(a);
  assert.deepEqual(antworten, ['Pong. Datenbank: nicht erreichbar.']);
  assert.deepEqual(log.mock.calls.map((c) => String(c.arguments[0])), ['/ping: Datenbank: connect ECONNREFUSED']);
});

// Ohne Frist in misse wartete /ping hier ewig; timeout lässt den Test dann fallen.
test('/ping antwortet nach 2 s, wenn die Datenbank hängt', { timeout: 5_000 }, async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const log = t.mock.method(console, 'error', () => {});
  const { a, antworten } = aufruf();
  const fertig = ping(haengt()).ausfuehren(a);
  t.mock.timers.tick(1_999);
  await new Promise(setImmediate);
  assert.deepEqual(antworten, []);
  t.mock.timers.tick(1);
  await fertig;
  assert.deepEqual(antworten, ['Pong. Datenbank: nicht erreichbar.']);
  assert.deepEqual(log.mock.calls.map((c) => String(c.arguments[0])), ['/ping: Datenbank: keine Antwort nach 2000 ms']);
});
