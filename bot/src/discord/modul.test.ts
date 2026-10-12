import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { DMChannel, Events, VoiceState, type Client, type Guild } from 'discord.js';
import { haengeAn, type DiscordModul } from './modul.js';
import { ANWENDUNG, ChannelType, discordClient, gilde, kanal, mitglied, mockDiscord, nachrichtDaten, schliesse, type MockDiscord } from '../testhilfe.js';

// Ereignisse von discord.js, wie haengeAn sie an die Module gibt. Alle IDs
// sind erfunden. Siehe docs/entwicklung/tests.md, „Die gemockte API“.
const SERVER = '300000000000000081';
const PERSON = '200000000000000081';
const TEXT = '520000000000000081';
const STIMME = '520000000000000082';

let mock: MockDiscord;
let client: Client;
let guild: Guild;
let zaehler = 0;
// Was die Module bekommen, der Reihe nach.
const gesehen: string[] = [];

// Zwei Module, die alles nur aufschreiben; `a` steht vor `b`.
function modulMit(name: 'a' | 'b'): DiscordModul {
  return {
    name,
    befehle: name === 'a' ? [{ name: 'probe', beschreibung: 'Probe.', ausfuehren: async () => void gesehen.push('a probe') }] : [],
    knoepfe: { praefix: `${name}:`, bediene: async (d) => void gesehen.push(`${name} knopf ${d.aktion}`) },
    ereignisse: {
      beitritt: async (m) => void gesehen.push(`${name} beitritt ${m.id}`),
      abschied: async (m) => void gesehen.push(`${name} abschied ${m.id}`),
      stimme: async (server, nutzer, vorher, nachher) => void gesehen.push(`${name} stimme ${server.id} ${nutzer} ${vorher} ${nachher}`),
      kanalWeg: async (k) => void gesehen.push(`${name} kanalWeg ${k}`),
    },
  };
}

before(async () => {
  mock = await mockDiscord();
  client = discordClient(mock, [
    gilde(SERVER, 'Module', '200000000000000099', [kanal(TEXT, ChannelType.GuildText, 'allgemein', 0, null), kanal(STIMME, ChannelType.GuildVoice, 'Lobby', 1, null)]),
  ]);
  guild = client.guilds.cache.get(SERVER) as Guild;
  haengeAn(client, [modulMit('a'), modulMit('b')]);
});

after(async () => {
  await schliesse(mock);
  await client.destroy();
});

// Was die Module bei `tue` bekommen.
async function nach(tue: () => void): Promise<string[]> {
  gesehen.length = 0;
  tue();
  await new Promise(setImmediate);
  return [...gesehen];
}

// Eine Interaktion, wie Discord sie schickt.
function interaktion(type: 2 | 3, data: object) {
  zaehler += 1;
  const aktionen = (client as unknown as { actions: { InteractionCreate: { handle(d: unknown): void } } }).actions;
  aktionen.InteractionCreate.handle({
    id: String(940000000000000000n + BigInt(zaehler)),
    application_id: ANWENDUNG,
    type,
    token: `token-modul-${zaehler}`,
    version: 1,
    guild_id: SERVER,
    channel: { id: TEXT, type: ChannelType.GuildText },
    channel_id: TEXT,
    member: { ...mitglied(PERSON, []), permissions: '0' },
    app_permissions: '0',
    locale: 'de',
    guild_locale: 'de',
    entitlements: [],
    authorizing_integration_owners: { 0: SERVER },
    context: 0,
    data,
    ...(type === 3 ? { message: nachrichtDaten(TEXT, 'Menü') } : {}),
  });
}

test('Beitritt und Abschied gehen als Mitglied an jedes Modul, in der Reihenfolge der Liste', async () => {
  const m = (guild.members as unknown as { _add(d: unknown): unknown })._add(mitglied(PERSON, []));
  assert.deepEqual(await nach(() => client.emit(Events.GuildMemberAdd, m as never)), [`a beitritt ${PERSON}`, `b beitritt ${PERSON}`]);
  assert.deepEqual(await nach(() => client.emit(Events.GuildMemberRemove, m as never)), [`a abschied ${PERSON}`, `b abschied ${PERSON}`]);
});

test('ein Wechsel des Sprachkanals kommt mit Griff, Person, vorher und nachher', async () => {
  const zustand = (kanalId: string | null) =>
    Reflect.construct(VoiceState, [guild, { user_id: PERSON, channel_id: kanalId, session_id: 's', deaf: false, mute: false, self_deaf: false, self_mute: false, self_video: false, suppress: false, request_to_speak_timestamp: null }]) as VoiceState;
  assert.deepEqual(await nach(() => client.emit(Events.VoiceStateUpdate, zustand(null), zustand(STIMME))), [
    `a stimme ${SERVER} ${PERSON} null ${STIMME}`,
    `b stimme ${SERVER} ${PERSON} null ${STIMME}`,
  ]);
});

test('ein gelöschter Kanal eines Servers geht an die Module, ein Kanal einer DM nicht', async () => {
  const text = guild.channels.cache.get(TEXT);
  assert.ok(text);
  assert.deepEqual(await nach(() => client.emit(Events.ChannelDelete, text as never)), [`a kanalWeg ${TEXT}`, `b kanalWeg ${TEXT}`]);
  const dm = Reflect.construct(DMChannel, [client, { id: '520000000000000089', type: ChannelType.DM, recipients: [mitglied(PERSON, []).user] }]) as DMChannel;
  assert.deepEqual(await nach(() => client.emit(Events.ChannelDelete, dm as never)), []);
});

test('ein Slash-Befehl geht an den Befehl seines Moduls, ein Knopf an das Modul mit seinem Präfix, sonst an keins', async () => {
  assert.deepEqual(await nach(() => interaktion(2, { id: '930000000000000081', name: 'probe', type: 1 })), ['a probe']);
  assert.deepEqual(await nach(() => interaktion(3, { custom_id: 'b:sperren', component_type: 2 })), ['b knopf sperren']);
  assert.deepEqual(await nach(() => interaktion(3, { custom_id: 'a:info', component_type: 2 })), ['a knopf info']);
  assert.deepEqual(await nach(() => interaktion(3, { custom_id: 'c:info', component_type: 2 })), []);
});
