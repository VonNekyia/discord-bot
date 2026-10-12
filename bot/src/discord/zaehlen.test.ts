import assert from 'node:assert/strict';
import { createServer, type OutgoingHttpHeaders } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test, type TestContext } from 'node:test';
import { Routes } from 'discord.js';
import { Zaehlung } from '../kern/zaehlung.js';
import { erstelleClient } from './client.js';
import { debugStand, zaehleAnfragen } from './zaehlen.js';

// `zaehleAnfragen` gegen eine gemockte API über `@discordjs/rest`. Alle IDs
// und Tokens sind erfunden. Siehe docs/entwicklung/tests.md, „Rate-Limits zählen“.
const KANAL = '500000000000000001';
const ANWENDUNG = '600000000000000001';
const INTERAKTION = '910000000000000001';
const TOKEN = 'aW50ZXJhY3Rpb246OTEwMDAwMDAwMDAwMDAwMDAxOnByb2Jl';

// Je `<Methode> <Pfad>` erst die Antworten in `zuerst`, danach 200 mit `danach`.
async function mockApi(t: TestContext, zuerst: Record<string, OutgoingHttpHeaders[]>, danach: OutgoingHttpHeaders = {}) {
  const server = createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      const kopf = zuerst[`${req.method} ${req.url}`]?.shift();
      if (kopf) {
        res.writeHead(429, { 'content-type': 'application/json', 'retry-after': '0', ...kopf });
        res.end(JSON.stringify({ message: 'You are being rate limited.', retry_after: 0, global: kopf['x-ratelimit-global'] === 'true' }));
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json', ...danach }).end('{}');
    });
  });
  await new Promise<void>((fertig) => server.listen(0, '127.0.0.1', fertig));
  const client = erstelleClient({ rest: { api: `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`, retries: 0 } });
  client.rest.setToken('test');
  const log: string[] = [];
  const zaehlung = new Zaehlung({ log: (zeile) => log.push(zeile) });
  zaehleAnfragen(client.rest, zaehlung);
  t.after(async () => {
    server.closeAllConnections();
    server.close();
    await client.destroy();
  });
  return { client, zaehlung, log };
}

test('ein 429 mit Headern gibt genau eine Logzeile ohne ID und Token, und die Zähler stimmen', async (t) => {
  const { client, zaehlung, log } = await mockApi(
    t,
    {
      [`POST /api/v10/channels/${KANAL}/messages`]: [
        { 'x-ratelimit-scope': 'user', 'x-ratelimit-limit': '5', 'x-ratelimit-remaining': '0', 'x-ratelimit-reset-after': '0.05' },
      ],
    },
    { 'x-ratelimit-limit': '5', 'x-ratelimit-remaining': '4', 'x-ratelimit-reset-after': '1.5' },
  );
  await client.rest.post(Routes.channelMessages(KANAL), { body: { content: 'hallo' } });
  assert.deepEqual(log, ['Rate-Limit: 429 bei POST /channels/:id/messages, Scope user, global nein, Retry-After 0 s, Limit 5, Remaining 0, Reset-After 0.05 s.']);
  const stand = debugStand(client, zaehlung);
  assert.deepEqual(stand.shards, [0]);
  assert.deepEqual(
    stand.routen.map((r) => ({ ...r, zuletzt: typeof r.zuletzt })),
    [{ methode: 'POST', route: '/channels/:id/messages', anfragen: 2, rateLimits: 1, limit: 5, remaining: 4, resetAfter: 1.5, zuletzt: 'string' }],
  );
  assert.deepEqual(stand.rateLimits, { anzahl: 1, global: 0, scope: { user: 1, global: 0, shared: 0 } });
  assert.equal(stand.ungueltig.letzte10min, 1);
});

test('Tokens von Interaktionen und Webhooks stehen weder im Stand noch im Log; global und shared zählen getrennt', async (t) => {
  const { client, zaehlung, log } = await mockApi(t, {
    [`POST /api/v10/interactions/${INTERAKTION}/${TOKEN}/callback?with_response=false`]: [{ 'x-ratelimit-scope': 'shared' }],
    [`PATCH /api/v10/webhooks/${ANWENDUNG}/${TOKEN}/messages/%40original`]: [{ 'x-ratelimit-scope': 'global', 'x-ratelimit-global': 'true' }],
  });
  await client.rest.post(Routes.interactionCallback(INTERAKTION, TOKEN), {
    auth: false,
    body: { type: 5, data: { flags: 64 } },
    query: new URLSearchParams({ with_response: 'false' }),
  });
  await client.rest.patch(Routes.webhookMessage(ANWENDUNG, TOKEN, '@original'), { auth: false, body: { content: 'fertig' } });
  const stand = debugStand(client, zaehlung);
  assert.deepEqual(stand.routen.map((r) => `${r.methode} ${r.route} ${r.anfragen} ${r.rateLimits}`).toSorted(), [
    'PATCH /webhooks/:id/:token/messages/@original 2 1',
    'POST /interactions/:id/:token/callback 2 1',
  ]);
  assert.deepEqual(stand.rateLimits, { anzahl: 2, global: 1, scope: { user: 0, global: 1, shared: 1 } });
  // Das 429 mit Scope shared zählt nicht zu den ungültigen.
  assert.equal(stand.ungueltig.letzte10min, 1);
  assert.equal(log.length, 2);
  for (const text of [...log, JSON.stringify(stand)]) assert.doesNotMatch(text, new RegExp(`${TOKEN}|\\d{17,}`));
});
