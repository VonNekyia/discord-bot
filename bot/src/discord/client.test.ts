import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { ClientUser, RateLimitError, Routes } from 'discord.js';
import { erstelleClient } from './client.js';

// Erfundene IDs.
const BOT = '100000000000000001';
const SERVER = '300000000000000003';

function mitglied(id: string) {
  return { user: { id, username: `nutzer-${id.slice(-2)}`, discriminator: '0', avatar: null }, roles: [], joined_at: '2026-01-01T00:00:00.000Z' };
}

test('der Cache hält Mitglieder und Nutzer nur für den Bot selbst', async () => {
  const client = erstelleClient();
  client.user = Reflect.construct(ClientUser, [client, { id: BOT, username: 'kitty', discriminator: '0', bot: true }]);
  const guilds = client.guilds as unknown as { _add(daten: unknown): unknown };
  guilds._add({
    id: SERVER,
    name: 'Probe',
    owner_id: '200000000000000002',
    roles: [],
    channels: [],
    members: [mitglied('200000000000000002'), mitglied(BOT), mitglied('200000000000000003')],
  });
  const guild = client.guilds.cache.get(SERVER);
  assert.deepEqual([...(guild?.members.cache.keys() ?? [])], [BOT]);
  assert.deepEqual([...client.users.cache.keys()], [BOT]);
  assert.equal(guild?.members.me?.id, BOT);
  await client.destroy();
});

test('nur PATCH /channels/:id wartet nicht auf ein Rate-Limit; Nachrichten und Löschen warten weiter', async (t) => {
  // Jede Route antwortet beim ersten Mal mit 429 und Retry-After 0, danach mit 200.
  const schon = new Set<string>();
  const anfragen: string[] = [];
  const server = createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      const wer = `${req.method} ${req.url}`;
      anfragen.push(wer);
      if (schon.has(wer)) {
        res.writeHead(200, { 'content-type': 'application/json' }).end('{}');
        return;
      }
      schon.add(wer);
      res.writeHead(429, { 'content-type': 'application/json', 'retry-after': '0', 'x-ratelimit-scope': 'user' });
      res.end(JSON.stringify({ message: 'You are being rate limited.', retry_after: 0, global: false }));
    });
  });
  await new Promise<void>((fertig) => server.listen(0, '127.0.0.1', fertig));
  const client = erstelleClient({ rest: { api: `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`, retries: 0 } });
  client.rest.setToken('test');
  t.after(async () => {
    server.closeAllConnections();
    server.close();
    await client.destroy();
  });

  await assert.rejects(client.rest.patch(Routes.channel('500000000000000001'), { body: { name: 'neu' } }), RateLimitError);
  await client.rest.post(Routes.channelMessages('500000000000000001'), { body: { content: 'hallo' } });
  await client.rest.delete(Routes.channel('500000000000000002'));
  assert.deepEqual(anfragen, [
    'PATCH /api/v10/channels/500000000000000001',
    'POST /api/v10/channels/500000000000000001/messages',
    'POST /api/v10/channels/500000000000000001/messages',
    'DELETE /api/v10/channels/500000000000000002',
    'DELETE /api/v10/channels/500000000000000002',
  ]);
});

// Eine API, die jedes `PATCH` mit `status` beantwortet, 429 mit Retry-After 300 s.
async function api(t: { after(fn: () => Promise<void>): void }, status: 200 | 429) {
  const anfragen: string[] = [];
  const server = createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      anfragen.push(`${req.method} ${req.url}`);
      if (status === 200) {
        res.writeHead(200, { 'content-type': 'application/json' }).end('{}');
        return;
      }
      res.writeHead(429, { 'content-type': 'application/json', 'retry-after': '300', 'x-ratelimit-scope': 'user' });
      res.end(JSON.stringify({ message: 'You are being rate limited.', retry_after: 300, global: false }));
    });
  });
  await new Promise<void>((fertig) => server.listen(0, '127.0.0.1', fertig));
  // Eine Anfrage je Sekunde: Die zweite trifft das globale Limit, das `@discordjs/rest` selbst rechnet.
  const client = erstelleClient({ rest: { api: `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`, retries: 0, globalRequestsPerSecond: 1 } });
  client.rest.setToken('test');
  t.after(async () => {
    server.closeAllConnections();
    server.close();
    await client.destroy();
  });
  return { client, anfragen };
}

test('auf das globale Limit von @discordjs/rest wartet auch PATCH /channels/:id', async (t) => {
  const { client, anfragen } = await api(t, 200);
  await client.rest.patch(Routes.channel('500000000000000001'), { body: { name: 'eins' } });
  await client.rest.patch(Routes.channel('500000000000000002'), { body: { name: 'zwei' } });
  assert.deepEqual(anfragen, ['PATCH /api/v10/channels/500000000000000001', 'PATCH /api/v10/channels/500000000000000002']);
});

test('ein 429 beim Umbenennen wirft auch, wenn die Anfragen der Sekunde verbraucht sind', { timeout: 5_000 }, async (t) => {
  const { client, anfragen } = await api(t, 429);
  const los = Date.now();
  await assert.rejects(client.rest.patch(Routes.channel('500000000000000001'), { body: { name: 'neu' } }), (fehler) => {
    assert.ok(fehler instanceof RateLimitError);
    assert.deepEqual([fehler.global, fehler.retryAfter], [true, 300_050]);
    return true;
  });
  assert.ok(Date.now() - los < 2_000);
  assert.equal(anfragen.length, 1);
});
