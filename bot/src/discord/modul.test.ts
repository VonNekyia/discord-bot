import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { DMChannel, Events, VoiceState, type Client, type Guild } from 'discord.js';
import { haengeAn, meldeBereit, modulAus, type DiscordModul } from './modul.js';
import { serverVon } from './server.js';
import { ANWENDUNG, ChannelType, discordClient, gilde, kanal, mitglied, mockDiscord, nachrichtDaten, schliesse, warteAufAntworten, type MockDiscord } from '../testhilfe.js';

// Ereignisse von discord.js, wie haengeAn sie an die Module gibt. Alle IDs
// sind erfunden. Siehe docs/entwicklung/tests.md, „Die gemockte API“.
const SERVER = '300000000000000081';
const PERSON = '200000000000000081';
const TEXT = '520000000000000081';
const STIMME = '520000000000000082';

let mock: MockDiscord;
let client: Client;
let guild: Guild;
// Ein zweiter Client mit Modulen, die einen Schalter haben; `aus` hält, welche aus sind.
let geschaltet: Client;
let geschaltetGuild: Guild;
const aus = new Set<string>();
const gefragt: string[] = [];
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
  geschaltet = discordClient(mock, [gilde(SERVER, 'Module', '200000000000000099', [kanal(TEXT, ChannelType.GuildText, 'allgemein', 0, null), kanal(STIMME, ChannelType.GuildVoice, 'Lobby', 1, null)])]);
  geschaltetGuild = geschaltet.guilds.cache.get(SERVER) as Guild;
  haengeAn(geschaltet, [modulMit('a'), mitSchalter('c')], async (modul, server) => {
    gefragt.push(`${modul} ${server}`);
    return !aus.has(modul);
  });
});

// Ein Modul mit Schalter: schreibt Ereignisse und Aufräumen getrennt auf.
function mitSchalter(name: string): DiscordModul {
  const basis = modulMit('b');
  return {
    ...basis,
    name,
    schalter: { titel: name, hilfe: 'Probe.' },
    befehle: [{ name: 'schalter', beschreibung: 'Probe.', ausfuehren: async () => void gesehen.push(`${name} befehl`) }],
    knoepfe: { praefix: `${name}:`, bediene: async (d) => void gesehen.push(`${name} knopf ${d.aktion}`) },
    // Schreibt den eigenen Namen auf, dann das, was `b` aufschreibt.
    ereignisse: Object.fromEntries(
      Object.entries(basis.ereignisse ?? {}).map(([k, f]) => [
        k,
        async (...x: unknown[]) => {
          gesehen.push(`${name} ${k}`);
          await Reflect.apply(f, undefined, x);
        },
      ]),
    ),
    aufraeumen: {
      bereit: async (server) => void gesehen.push(`${name} räumt bereit ${server.length}`),
      stimme: async () => void gesehen.push(`${name} räumt stimme`),
      kanalWeg: async () => void gesehen.push(`${name} räumt kanalWeg`),
    },
  };
}

after(async () => {
  await schliesse(mock);
  await client.destroy();
  await geschaltet.destroy();
});

// Was die Module bei `tue` bekommen.
async function nach(tue: () => void): Promise<string[]> {
  gesehen.length = 0;
  tue();
  await new Promise(setImmediate);
  await new Promise(setImmediate);
  return [...gesehen];
}

// Eine Interaktion, wie Discord sie schickt.
function interaktion(type: 2 | 3 | 5, data: object, an: Client = client) {
  zaehler += 1;
  const aktionen = (an as unknown as { actions: { InteractionCreate: { handle(d: unknown): void } } }).actions;
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

// Siehe docs/schnittstelle/module.md, „Ein Modul ist aus“.
test('ein Modul, das aus ist, bekommt keine Ereignisse, nur sein Aufräumen; Befehle und Knöpfe sagen, dass es aus ist', async () => {
  const m = (geschaltetGuild.members as unknown as { _add(d: unknown): unknown })._add(mitglied(PERSON, []));
  const zustand = (kanalId: string | null) =>
    Reflect.construct(VoiceState, [geschaltetGuild, { user_id: PERSON, channel_id: kanalId, session_id: 's', deaf: false, mute: false, self_deaf: false, self_mute: false, self_video: false, suppress: false, request_to_speak_timestamp: null }]) as VoiceState;
  const text = geschaltetGuild.channels.cache.get(TEXT);
  assert.ok(text);
  const alles = async () => [
    ...(await nach(() => geschaltet.emit(Events.GuildMemberAdd, m as never))),
    ...(await nach(() => geschaltet.emit(Events.GuildMemberRemove, m as never))),
    ...(await nach(() => geschaltet.emit(Events.VoiceStateUpdate, zustand(STIMME), zustand(null)))),
    ...(await nach(() => geschaltet.emit(Events.ChannelDelete, text as never))),
    ...(await nach(() => interaktion(2, { id: '930000000000000082', name: 'schalter', type: 1 }, geschaltet))),
    ...(await nach(() => interaktion(3, { custom_id: 'c:sperren', component_type: 2 }, geschaltet))),
    // Ein abgeschicktes Formular: Zwischen Befehl und Formular kann das Modul ausgehen.
    ...(await nach(() => interaktion(5, { custom_id: 'c:formular', components: [] }, geschaltet))),
  ];

  // An: alles kommt an, das Aufräumen dazu.
  aus.clear();
  assert.deepEqual(await alles(), [
    `a beitritt ${PERSON}`,
    'c beitritt',
    `b beitritt ${PERSON}`,
    `a abschied ${PERSON}`,
    'c abschied',
    `b abschied ${PERSON}`,
    `a stimme ${SERVER} ${PERSON} ${STIMME} null`,
    'c räumt stimme',
    'c stimme',
    `b stimme ${SERVER} ${PERSON} ${STIMME} null`,
    `a kanalWeg ${TEXT}`,
    'c räumt kanalWeg',
    'c kanalWeg',
    `b kanalWeg ${TEXT}`,
    'c befehl',
    'c knopf sperren',
    'c knopf formular',
  ]);
  assert.ok(gefragt.every((g) => g === `c ${SERVER}`) && gefragt.length > 0);

  // Aus: nur das Modul ohne Schalter und das Aufräumen.
  aus.add('c');
  const vorher = mock.antworten.length;
  assert.deepEqual(await alles(), [`a beitritt ${PERSON}`, `a abschied ${PERSON}`, `a stimme ${SERVER} ${PERSON} ${STIMME} null`, 'c räumt stimme', `a kanalWeg ${TEXT}`, 'c räumt kanalWeg']);
  const antworten = await warteAufAntworten(mock, vorher, 3);
  assert.equal(antworten.length, 3);
  for (const a of antworten) {
    assert.equal(a.daten.content, modulAus);
    assert.equal(a.daten.flags, 64);
    assert.deepEqual((a.daten as { allowed_mentions?: unknown }).allowed_mentions, { parse: [] });
  }
  aus.clear();
});

test('scheitert die Frage, ob ein Modul an ist, kommt kein Ereignis an; Befehl und Knopf bekommen den allgemeinen Fehlersatz', async (t) => {
  const log = t.mock.method(console, 'error', () => {});
  const fehlt = discordClient(mock, [gilde(SERVER, 'Module', '200000000000000099', [kanal(TEXT, ChannelType.GuildText, 'allgemein', 0, null)])]);
  t.after(() => fehlt.destroy());
  haengeAn(fehlt, [mitSchalter('d')], async () => {
    throw new Error('Datenbank weg');
  });
  const m = ((fehlt.guilds.cache.get(SERVER) as Guild).members as unknown as { _add(d: unknown): unknown })._add(mitglied(PERSON, []));
  assert.deepEqual(await nach(() => fehlt.emit(Events.GuildMemberAdd, m as never)), []);
  const vorher = mock.antworten.length;
  assert.deepEqual(await nach(() => interaktion(2, { id: '930000000000000083', name: 'schalter', type: 1 }, fehlt)), []);
  assert.deepEqual(await nach(() => interaktion(3, { custom_id: 'd:sperren', component_type: 2 }, fehlt)), []);
  const antworten = await warteAufAntworten(mock, vorher, 2);
  assert.deepEqual(
    antworten.map((a) => [a.daten.content, a.daten.flags]),
    [
      ['Das hat nicht geklappt.', 64],
      ['Das hat nicht geklappt.', 64],
    ],
  );
  const zeilen = log.mock.calls.map((c) => String(c.arguments[0]));
  assert.deepEqual(zeilen, ['Board: Datenbank weg', 'Board: Datenbank weg', 'Board: Datenbank weg']);
});

test('meldeBereit: Aufräumen mit allen Servern, bereit nur mit denen, auf denen das Modul an ist', async () => {
  const zwei = [serverVon(guild), serverVon(geschaltetGuild)];
  const bekommen: string[][] = [];
  const modul: DiscordModul = {
    name: 'e',
    schalter: { titel: 'e', hilfe: 'Probe.' },
    ereignisse: { bereit: async (s) => void bekommen.push(s.map((x) => x.id)) },
    aufraeumen: { bereit: async (s) => void bekommen.push(['aufräumen', ...s.map((x) => x.id)]) },
  };
  let erster = true;
  await meldeBereit([modul], zwei, async () => {
    const ja = erster;
    erster = false;
    return ja;
  });
  assert.deepEqual(bekommen, [['aufräumen', SERVER, SERVER], [SERVER]]);
});
