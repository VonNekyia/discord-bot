import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ClientUser } from 'discord.js';
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
