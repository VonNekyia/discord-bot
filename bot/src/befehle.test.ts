import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test, type TestContext } from 'node:test';
import { REST, type ChatInputCommandInteraction } from 'discord.js';
import { beantworte, registriere, type Kontext } from './befehle.js';

// Gemockte Discord-API: antwortet der Reihe nach mit den Statuscodes in
// `antworten`, danach mit 200. Siehe docs/entwicklung/tests.md.
async function mockApi(t: TestContext, antworten: number[]) {
  const anfragen: { methode: string; pfad: string; body: string }[] = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (stueck) => (body += stueck));
    req.on('end', () => {
      anfragen.push({ methode: req.method ?? '', pfad: req.url ?? '', body });
      const status = antworten.shift() ?? 200;
      if (status === 429) {
        res.writeHead(429, { 'content-type': 'application/json', 'retry-after': '0', 'x-ratelimit-scope': 'user' });
        res.end(JSON.stringify({ message: 'You are being rate limited.', retry_after: 0, global: false }));
      } else {
        res.writeHead(status, { 'content-type': 'application/json' }).end('[]');
      }
    });
  });
  await new Promise<void>((fertig) => server.listen(0, '127.0.0.1', fertig));
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const { port } = server.address() as AddressInfo;
  const rest = new REST({ api: `http://127.0.0.1:${port}/api`, retries: 1 }).setToken('test');
  return { rest, anfragen };
}

// Eine Datenbank, die nur `query` kann: antwortet sofort oder wirft.
function datenbank(fehler?: Error): Kontext {
  return { db: { query: async () => { if (fehler) throw fehler; return [[], []]; } } as unknown as Kontext['db'] };
}

// Eine Interaktion, die nur hat, was beantworte braucht.
function interaktion(commandName: string) {
  const antworten: { content?: string; flags?: unknown }[] = [];
  const objekt = {
    commandName,
    replied: false,
    deferred: false,
    user: { id: '100000000000000001' },
    reply: async (antwort: { content?: string; flags?: unknown }) => void antworten.push(antwort),
    followUp: async (antwort: { content?: string; flags?: unknown }) => void antworten.push(antwort),
  };
  return { interaction: objekt as unknown as ChatInputCommandInteraction, antworten };
}

test('registriere ersetzt alle Befehle mit einem PUT', async (t) => {
  const { rest, anfragen } = await mockApi(t, []);
  await registriere(rest, '1');
  assert.equal(anfragen.length, 1);
  assert.equal(anfragen[0]?.methode, 'PUT');
  assert.equal(anfragen[0]?.pfad, '/api/v10/applications/1/commands');
  assert.deepEqual(JSON.parse(anfragen[0]?.body ?? '').map((b: { name: string }) => b.name), ['ping']);
});

test('registriere wartet nach 429 und versucht es noch einmal', async (t) => {
  const { rest, anfragen } = await mockApi(t, [429]);
  await registriere(rest, '1');
  assert.equal(anfragen.length, 2);
});

test('registriere gibt nach 5xx und einem Versuch auf', async (t) => {
  const { rest, anfragen } = await mockApi(t, [500, 502, 503]);
  await assert.rejects(registriere(rest, '1'));
  assert.equal(anfragen.length, 2);
});

test('/ping antwortet nur dem Nutzer, mit der Zeit der Datenbank', async () => {
  const { interaction, antworten } = interaktion('ping');
  await beantworte(interaction, datenbank());
  assert.equal(antworten.length, 1);
  assert.match(antworten[0]?.content ?? '', /^Pong\. Datenbank: \d+ ms\.$/);
  assert.equal(antworten[0]?.flags, 64);
});

test('/ping antwortet auch, wenn die Datenbank fehlt', async (t) => {
  const log = t.mock.method(console, 'error', () => {});
  const { interaction, antworten } = interaktion('ping');
  await beantworte(interaction, datenbank(new Error('connect ECONNREFUSED')));
  assert.deepEqual(antworten, [{ content: 'Pong. Datenbank: nicht erreichbar.', flags: 64 }]);
  assert.deepEqual(log.mock.calls.map((c) => String(c.arguments[0])), ['/ping: Datenbank: connect ECONNREFUSED']);
});

test('ein unbekannter Befehl bekommt eine Meldung, das Log keine Nutzerdaten', async (t) => {
  const log = t.mock.method(console, 'error', () => {});
  const { interaction, antworten } = interaktion('gibt-es-nicht');
  await beantworte(interaction, datenbank());
  assert.deepEqual(antworten, [{ content: 'Das hat nicht geklappt.', flags: 64 }]);
  const zeilen = log.mock.calls.map((c) => String(c.arguments[0]));
  assert.deepEqual(zeilen, ['/gibt-es-nicht: unbekannter Befehl']);
});
