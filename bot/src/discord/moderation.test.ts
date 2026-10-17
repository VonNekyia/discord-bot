import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { PermissionFlagsBits as R, type Client, type Guild } from 'discord.js';
import { DiscordFehler } from './fehler.js';
import { banne, botAuf, kicke, kuerze, rollenAuf, schreibe, zielAuf } from './moderation.js';
import { serverVon, type Server } from './server.js';
import { BOT, discordClient, gilde, mitglied, mockDiscord, rolle, ROLLE_BOT, ROLLE_TEAM, schliesse, type MockDiscord } from '../testhilfe.js';

// Bannen, kicken, DMs, Ziele und Rollen gegen die gemockte API. Alle IDs
// sind erfunden. Siehe docs/entwicklung/tests.md, „Die gemockte API“.
const SERVER = '300000000000000101';
const EIGENTUEMER = '200000000000000109';
const MITGLIED = '200000000000000101';
const FREMD = '200000000000000102';
const WEG = '200000000000000103';
const VERWALTET = '400000000000000105';
const UNTEN = '400000000000000106';

let mock: MockDiscord;
let client: Client;
let server: Server;

before(async () => {
  mock = await mockDiscord();
  const daten = gilde(SERVER, 'Moderation', EIGENTUEMER);
  daten.roles = [
    ...daten.roles,
    { ...rolle(VERWALTET, 'Integration', 0n, 3), managed: true },
    rolle(UNTEN, 'Unten', 0n, 1),
  ];
  // Der Bot darf bannen und kicken.
  daten.roles[1] = rolle(ROLLE_BOT, 'kitty', R.BanMembers | R.KickMembers, 4);
  client = discordClient(mock, [daten]);
  server = serverVon(client.guilds.cache.get(SERVER) as Guild);
  mock.mitglieder.set(`${SERVER}/${MITGLIED}`, mitglied(MITGLIED, [ROLLE_TEAM]));
  mock.nutzer.set(FREMD, mitglied(FREMD, []).user);
});

after(async () => {
  await schliesse(mock);
  await client.destroy();
});

test('banne löscht keine Nachrichten und trägt den Grund ins Audit-Log, gekürzt auf 512 Zeichen', async () => {
  await banne(server, MITGLIED, 'Spam · /ban von probe');
  await banne(server, FREMD, 'x'.repeat(600));
  assert.deepEqual(mock.gebannt, [
    { server: SERVER, nutzer: MITGLIED, body: { delete_message_seconds: 0 }, grund: 'Spam · /ban von probe' },
    { server: SERVER, nutzer: FREMD, body: { delete_message_seconds: 0 }, grund: 'x'.repeat(512) },
  ]);
  assert.equal(kuerze('kurz'), 'kurz');
});

test('kicke mit Grund; fehlt dem Bot das Recht (50013), kommt kein_recht', async (t) => {
  await kicke(server, MITGLIED, 'Spam');
  assert.deepEqual(mock.gekickt.at(-1), { server: SERVER, nutzer: MITGLIED, grund: 'Spam' });
  mock.kickFehler = [403, 50013];
  t.after(() => {
    mock.kickFehler = undefined;
  });
  await assert.rejects(kicke(server, MITGLIED, 'Spam'), (e: unknown) => e instanceof DiscordFehler && e.code === 'kein_recht');
});

test('schreibe schickt eine DM ohne Erwähnungen; nimmt die Person keine an (50007), kommt kein_dm', async (t) => {
  await schreibe(server, MITGLIED, 'Hallo <@200000000000000101>.');
  const dm = mock.nachrichten.at(-1);
  assert.equal(dm?.kanal, `9${MITGLIED.slice(1)}`);
  assert.equal(dm?.json.content, 'Hallo <@200000000000000101>.');
  assert.deepEqual(dm?.json.allowed_mentions, { parse: [] });
  mock.dmFehler = [403, 50007];
  t.after(() => {
    mock.dmFehler = undefined;
  });
  await assert.rejects(schreibe(server, MITGLIED, 'Hallo.'), (e: unknown) => e instanceof DiscordFehler && e.code === 'kein_dm');
});

test('zielAuf: ein Mitglied mit Rang, ein Nutzer ohne Server nur als Person, ein unbekannter undefined', async () => {
  assert.deepEqual(await zielAuf(server, MITGLIED), {
    person: { id: MITGLIED, name: 'nutzer-01', benutzername: 'nutzer-01', bot: false },
    rang: { eigentuemer: false, admin: false, rollen: [ROLLE_TEAM], hoechste: 2 },
  });
  assert.deepEqual(await zielAuf(server, FREMD), { person: { id: FREMD, name: 'nutzer-02', benutzername: 'nutzer-02', bot: false } });
  assert.equal(await zielAuf(server, WEG), undefined);
});

test('botAuf: Rang und Rechte des Bots; rollenAuf ohne @everyone und verwaltete Rollen, die höchste zuerst', () => {
  assert.deepEqual(botAuf(server), { id: BOT, rang: { eigentuemer: false, admin: false, rollen: [ROLLE_BOT], hoechste: 4 }, bannen: true, kicken: true });
  assert.deepEqual(
    rollenAuf(server).map((r) => r.name),
    ['kitty', 'Team', 'Unten'],
  );
});
