import assert from 'node:assert/strict';
import { createServer, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test, type TestContext } from 'node:test';
import { erstelleClient } from './client.js';
import { oauthUeber } from './oauth.js';

// `oauthUeber` gegen eine gemockte API, die nie oder erst nach einem 429
// antwortet. Siehe docs/entwicklung/tests.md, „Rate-Limits zählen“.

async function mockApi(t: TestContext, bearbeite: (pfad: string, res: ServerResponse) => void) {
  const anfragen: string[] = [];
  const server = createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      // Alle Header roh: Node behält von doppelten Authorization-Headern nur den ersten.
      anfragen.push(`${req.method} ${req.url} ${req.rawHeaders.filter((_, i, k) => k[i - 1]?.toLowerCase() === 'authorization').join(' | ')}`);
      bearbeite(req.url ?? '', res);
    });
  });
  await new Promise<void>((fertig) => server.listen(0, '127.0.0.1', fertig));
  const client = erstelleClient({ rest: { api: `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`, retries: 0 } });
  t.after(async () => {
    server.closeAllConnections();
    server.close();
    await client.destroy();
  });
  return { client, anfragen };
}

test('ein Aufruf trägt den eigenen Authorization-Header, nicht den Token des Bots', async (t) => {
  const { client, anfragen } = await mockApi(t, (_, res) => res.writeHead(200, { 'content-type': 'application/json' }).end('{"id":"1"}'));
  client.rest.setToken('token-des-bots');
  const frage = oauthUeber(client.rest);
  assert.deepEqual(await frage({ schritt: 'Person', methode: 'GET', pfad: '/users/@me', kopf: 'Bearer zugang-der-person' }), { id: '1' });
  assert.deepEqual(anfragen, ['GET /api/v10/users/@me Bearer zugang-der-person']);
});

test('antwortet Discord nicht, scheitert der Aufruf nach der Frist', async (t) => {
  const { client } = await mockApi(t, () => {});
  const los = Date.now();
  await assert.rejects(
    oauthUeber(client.rest, 200)({ schritt: 'Person', methode: 'GET', pfad: '/users/@me', kopf: 'Bearer x' }),
    { message: 'Person: Frist abgelaufen' },
  );
  assert.ok(Date.now() - los < 2_000);
});

test('die Frist gilt auch, während @discordjs/rest ein Retry-After abwartet', async (t) => {
  const { client, anfragen } = await mockApi(t, (_, res) => {
    res.writeHead(429, { 'content-type': 'application/json', 'retry-after': '1', 'x-ratelimit-scope': 'user' });
    res.end(JSON.stringify({ message: 'You are being rate limited.', retry_after: 1, global: false }));
  });
  const los = Date.now();
  await assert.rejects(
    oauthUeber(client.rest, 200)({ schritt: 'Server', methode: 'GET', pfad: '/users/@me/guilds', kopf: 'Bearer x' }),
    { message: 'Server: Frist abgelaufen' },
  );
  assert.ok(Date.now() - los < 900);
  assert.equal(anfragen.length, 1);
});
