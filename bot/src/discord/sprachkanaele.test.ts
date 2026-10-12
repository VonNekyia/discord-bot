import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { Client, Guild, GuildMember } from 'discord.js';
import { kontextVon } from './kontext.js';
import { alsOverwrite } from './rechte.js';
import { guildVon, serverVon } from './server.js';
import { eintraegeVon, kategorieVon, sprachraum } from './sprachkanaele.js';
import { ChannelType, discordClient, gilde, kanal, mitglied, mockDiscord, R, ROLLE_TEAM, schliesse, type MockDiscord } from '../testhilfe.js';

// Griff, Kontext und Rechte-Einträge der Discord-Schicht, ohne Aufruf an
// Discord. Alle IDs sind erfunden. Siehe docs/entwicklung/tests.md, „Die gemockte API“.
const SERVER = '300000000000000012';
const PERSON = '200000000000000071';
const K = { kategorie: '520000000000000011', sprache: '520000000000000012', text: '520000000000000013' };

let mock: MockDiscord;
let client: Client;
let guild: Guild;

before(async () => {
  mock = await mockDiscord();
  const eintrag = (id: string, type: number, allow: bigint, deny: bigint) => ({ id, type, allow: String(allow), deny: String(deny) });
  client = discordClient(mock, [
    gilde(SERVER, 'Griffe', '200000000000000099', [
      {
        ...kanal(K.kategorie, ChannelType.GuildCategory, 'Räume', 0, null),
        permission_overwrites: [eintrag(SERVER, 0, 0n, R.ViewChannel), eintrag(ROLLE_TEAM, 0, R.ViewChannel, 0n), eintrag(PERSON, 1, R.Connect, R.Speak)],
      },
      { ...kanal(K.sprache, ChannelType.GuildVoice, 'Lobby', 0, K.kategorie), user_limit: 5, permission_overwrites: [eintrag(PERSON, 1, R.Connect, 0n)] },
      kanal(K.text, ChannelType.GuildText, 'text', 1, null),
    ]),
  ]);
  guild = client.guilds.cache.get(SERVER) as Guild;
});

after(async () => {
  await schliesse(mock);
  await client.destroy();
});

test('der Griff trägt ID und Name; nur ein Griff aus serverVon führt zur Guild', () => {
  const server = serverVon(guild);
  assert.deepEqual([server.id, server.name, Object.isFrozen(server)], [SERVER, 'Griffe', true]);
  assert.equal(guildVon(server), guild);
  // Eine Kopie hat dieselben Felder, aber keine Guild dahinter.
  assert.throws(() => guildVon({ ...server }), /Server ohne Guild/);
});

test('kontextVon gibt Griff und Mitglied mit eigenen Typen', () => {
  const m = (guild.members as unknown as { _add(d: unknown): GuildMember })._add(mitglied(PERSON, [], { global_name: 'Mia' }));
  const k = kontextVon(guild, m);
  assert.equal(k.server.id, SERVER);
  assert.deepEqual([k.mitglied.id, k.mitglied.name, k.mitglied.server.anzahl], [PERSON, 'Mia', 42]);
});

test('eintraegeVon: die Einträge einer Kategorie mit art; kein Ergebnis für andere Kanäle', () => {
  const server = serverVon(guild);
  const eintraege = eintraegeVon(server, K.kategorie) ?? [];
  assert.deepEqual(
    eintraege.toSorted((a, b) => a.id.localeCompare(b.id)),
    [
      { id: PERSON, art: 'person', allow: R.Connect, deny: R.Speak },
      { id: SERVER, art: 'rolle', allow: 0n, deny: R.ViewChannel },
      { id: ROLLE_TEAM, art: 'rolle', allow: R.ViewChannel, deny: 0n },
    ],
  );
  assert.equal(eintraegeVon(server, K.sprache), undefined);
  assert.equal(eintraegeVon(server, K.text), undefined);
  assert.equal(eintraegeVon(server, '520000000000000099'), undefined);
  assert.equal(kategorieVon(server, K.sprache), K.kategorie);
  assert.equal(kategorieVon(server, K.text), null);
});

test('alsOverwrite macht aus art wieder den Typ von Discord', () => {
  assert.deepEqual(alsOverwrite({ id: SERVER, art: 'rolle', allow: 1n, deny: 2n }), { id: SERVER, type: 0, allow: 1n, deny: 2n });
  assert.deepEqual(alsOverwrite({ id: PERSON, art: 'person', allow: 0n, deny: 3n }), { id: PERSON, type: 1, allow: 0n, deny: 3n });
});

test('sprachraum: ein Sprachkanal mit Name, Limit und Einträgen, dazu die seiner Kategorie; jeder andere Kanal nicht', () => {
  const server = serverVon(guild);
  const raum = sprachraum(server, K.sprache);
  assert.deepEqual([raum?.id, raum?.name, raum?.limit], [K.sprache, 'Lobby', 5]);
  assert.deepEqual(raum?.eintraege, [{ id: PERSON, art: 'person', allow: R.Connect, deny: 0n }]);
  assert.equal(raum?.kategorieEintraege.length, 3);
  for (const id of [K.kategorie, K.text, '520000000000000099']) assert.equal(sprachraum(server, id), undefined, id);
});
