import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ANWENDUNG, PERSON, abo, discordClient, einmalkauf, mockDiscord, schliesse } from '../testhilfe.js';
import { Events } from 'discord.js';
import { hoereAufKaeufe, hoereAufSitzungen, kaeufeVon, type Kauf, type KaufEreignis } from './kaeufe.js';

// Käufe gegen die gemockte API; alle IDs sind erfunden.
// Siehe docs/entscheidungen/0020-bezahlte-module.md.
const SKU = '500000000000000001';
const ALLES = '500000000000000002';
const SERVER = '300000000000000111';

const query = (pfad: string) => new URLSearchParams(pfad.split('?')[1] ?? '');

test('vonPerson liest alle Seiten, mit after hinter dem grössten Kauf', async (t) => {
  const mock = await mockDiscord();
  const client = discordClient(mock, []);
  t.after(async () => {
    await client.destroy();
    await schliesse(mock);
  });
  mock.kaeufe = Array.from({ length: 101 }, (_, i) => einmalkauf(String(510000000000001000n + BigInt(i)), SKU, PERSON));
  mock.kaeufe.push(einmalkauf('510000000000002000', SKU, '200000000000000099'));
  const kaeufe = await kaeufeVon(client).vonPerson(PERSON, SKU);
  assert.equal(kaeufe.length, 101);
  assert.deepEqual(kaeufe[0], { id: '510000000000001000', sku: SKU, server: null, verbraucht: false, geloescht: false, ende: null });
  const listen = mock.anfragen.filter((a) => a.pfad.includes('/entitlements?'));
  assert.equal(listen.length, 2);
  assert.equal(query(listen[0]?.pfad ?? '').get('user_id'), PERSON);
  assert.equal(query(listen[0]?.pfad ?? '').get('sku_ids'), SKU);
  assert.equal(query(listen[1]?.pfad ?? '').get('after'), '510000000000001099');
});

test('vonServer fragt mit guild_id, sku_ids und exclude_ended; einer gibt undefined für einen unbekannten Kauf', async (t) => {
  const mock = await mockDiscord();
  const client = discordClient(mock, []);
  t.after(async () => {
    await client.destroy();
    await schliesse(mock);
  });
  mock.kaeufe = [abo('520000000000000001', ALLES, SERVER), abo('520000000000000002', ALLES, SERVER, '2020-01-01T00:00:00.000Z')];
  const k = kaeufeVon(client);
  assert.deepEqual(
    (await k.vonServer(SERVER, [ALLES, SKU])).map((x) => x.id),
    ['520000000000000001'],
  );
  const q = query(mock.anfragen.at(-1)?.pfad ?? '');
  assert.equal(q.get('guild_id'), SERVER);
  assert.equal(q.get('sku_ids'), `${ALLES},${SKU}`);
  assert.equal(q.get('exclude_ended'), 'true');
  assert.equal(await k.einer('529999999999999999'), undefined);
  assert.equal((await k.einer('520000000000000001'))?.server, SERVER);
  assert.equal(k.laden(SKU), `https://discord.com/application-directory/${ANWENDUNG}/store/${SKU}`);
  assert.equal(k.laden(), `https://discord.com/application-directory/${ANWENDUNG}/store`);
});

test('verbrauche setzt consumed bei Discord', async (t) => {
  const mock = await mockDiscord();
  const client = discordClient(mock, []);
  t.after(async () => {
    await client.destroy();
    await schliesse(mock);
  });
  mock.kaeufe = [einmalkauf('510000000000000001', SKU, PERSON)];
  await kaeufeVon(client).verbrauche('510000000000000001');
  assert.equal(mock.kaeufe[0]?.consumed, true);
  assert.ok(mock.anfragen.some((a) => a.methode === 'POST' && a.pfad.endsWith('/entitlements/510000000000000001/consume')));
});

test('Ereignisse kommen als Kauf, ohne Discord-ID der Person; der Cache der Anwendung bleibt leer', async (t) => {
  const mock = await mockDiscord();
  const client = discordClient(mock, []);
  t.after(async () => {
    await client.destroy();
    await schliesse(mock);
  });
  const gesehen: [KaufEreignis, Kauf][] = [];
  hoereAufKaeufe(client, (art, kauf) => gesehen.push([art, kauf]));
  const aktionen = (client as unknown as { actions: Record<string, { handle(daten: unknown): unknown }> }).actions;
  const daten = { ...abo('520000000000000001', ALLES, SERVER, '2030-01-01T00:00:00.000Z'), user_id: PERSON };
  aktionen.EntitlementCreate?.handle(daten);
  aktionen.EntitlementUpdate?.handle({ ...daten, ends_at: '2031-01-01T00:00:00.000Z' });
  // Ohne EntitlementManager mit maxSize 0 stünde der Kauf hier samt user_id im Cache.
  assert.equal(client.application?.entitlements.cache.size, 0);
  aktionen.EntitlementDelete?.handle({ ...daten, deleted: true });
  const kauf = { id: '520000000000000001', sku: ALLES, server: SERVER, verbraucht: false, geloescht: false, ende: Date.parse('2030-01-01T00:00:00.000Z') };
  assert.deepEqual(gesehen, [
    ['neu', kauf],
    ['geaendert', { ...kauf, ende: Date.parse('2031-01-01T00:00:00.000Z') }],
    ['geloescht', { ...kauf, geloescht: true }],
  ]);
  assert.ok(!JSON.stringify(gesehen).includes(PERSON));
});

test('jede neue Sitzung eines Shards meldet Shard und Anzahl; ohne ShardingManager einer von einem', async (t) => {
  const mock = await mockDiscord();
  const client = discordClient(mock, []);
  t.after(async () => {
    await client.destroy();
    await schliesse(mock);
  });
  const sitzungen: { id: number; anzahl: number }[] = [];
  hoereAufSitzungen(client, (shard) => sitzungen.push(shard));
  client.emit(Events.ShardReady, 0, undefined);
  client.emit(Events.ShardResume, 0, 3);
  assert.deepEqual(sitzungen, [{ id: 0, anzahl: 1 }]);
});
