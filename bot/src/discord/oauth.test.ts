import assert from 'node:assert/strict';
import { createServer, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test, type TestContext } from 'node:test';
import { Routes } from 'discord.js';
import { Zaehlung } from '../kern/zaehlung.js';
import { erstelleClient } from './client.js';
import { oauthUeber } from './oauth.js';

// `oauthUeber` gegen eine gemockte API, die nie, spät oder mit 429
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
  client.rest.setToken('token-des-bots');
  t.after(async () => {
    server.closeAllConnections();
    server.close();
    await client.destroy();
  });
  return { client, anfragen };
}

const ok = (res: ServerResponse) => res.writeHead(200, { 'content-type': 'application/json' }).end('{"id":"1"}');

function zuViele(res: ServerResponse, sekunden: number, global = false) {
  const kopf = { 'content-type': 'application/json', 'retry-after': String(sekunden), 'x-ratelimit-scope': global ? 'global' : 'user' };
  res.writeHead(429, global ? { ...kopf, 'x-ratelimit-global': 'true' } : kopf);
  res.end(JSON.stringify({ message: 'You are being rate limited.', retry_after: sekunden, global }));
}

test('ein Aufruf trägt den eigenen Authorization-Header, nicht den Token des Bots', async (t) => {
  const { client, anfragen } = await mockApi(t, (_, res) => ok(res));
  const frage = oauthUeber(client.rest);
  assert.deepEqual(await frage({ schritt: 'Person', methode: 'GET', pfad: '/users/@me', kopf: 'Bearer zugang-der-person' }), { id: '1' });
  assert.deepEqual(anfragen, ['GET /api/v10/users/@me Bearer zugang-der-person']);
});

test('antwortet Discord nicht, scheitert der Aufruf nach der Frist', async (t) => {
  const { client } = await mockApi(t, () => {});
  const los = Date.now();
  await assert.rejects(
    oauthUeber(client.rest, { frist: 200 })({ schritt: 'Person', methode: 'GET', pfad: '/users/@me', kopf: 'Bearer x' }),
    { message: 'Person: Frist abgelaufen' },
  );
  assert.ok(Date.now() - los < 2_000);
});

test('die Frist gilt auch, während @discordjs/rest ein Retry-After abwartet', async (t) => {
  // 400 ms bis zur Antwort, dann 0,8 s Retry-After: kürzer als die Frist, zusammen länger.
  const { client, anfragen } = await mockApi(t, (_, res) => void setTimeout(() => zuViele(res, 0.8), 400));
  const los = Date.now();
  await assert.rejects(
    oauthUeber(client.rest, { frist: 1_000 })({ schritt: 'Server', methode: 'GET', pfad: '/users/@me/guilds', kopf: 'Bearer x' }),
    { message: 'Server: Frist abgelaufen' },
  );
  const dauer = Date.now() - los;
  assert.ok(dauer >= 900 && dauer < 1_200, String(dauer));
  assert.equal(anfragen.length, 1);
});

test('ein globales 429 der Anmeldung bremst den Bot nicht; die Zählung hat es trotzdem', { timeout: 5_000 }, async (t) => {
  const { client, anfragen } = await mockApi(t, (pfad, res) => (pfad === '/api/v10/users/@me' ? zuViele(res, 60, true) : ok(res)));
  const zaehlung = new Zaehlung({ log: () => {} });
  await assert.rejects(
    oauthUeber(client.rest, { zaehlung })({ schritt: 'Person', methode: 'GET', pfad: '/users/@me', kopf: 'Bearer x' }),
    { message: 'Person: Discord antwortet 429, Retry-After 60 s' },
  );
  const los = Date.now();
  await client.rest.get(Routes.gateway());
  assert.ok(Date.now() - los < 1_000);
  assert.deepEqual(
    anfragen.map((a) => a.split(' ').slice(0, 2).join(' ')),
    ['GET /api/v10/users/@me', 'GET /api/v10/gateway'],
  );
  const stand = zaehlung.stand([0]);
  assert.deepEqual(stand.rateLimits, { anzahl: 1, global: 1, scope: { user: 0, global: 1, shared: 0 } });
  assert.deepEqual(
    stand.routen.map((r) => `${r.methode} ${r.route}`),
    ['GET /users/@me'],
  );
});
