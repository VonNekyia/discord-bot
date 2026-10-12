import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import type { Client, Guild, GuildMember } from 'discord.js';
import { DiscordFehler } from './fehler.js';
import { alsMitglied, textkanal, textkanalAuf } from './nachrichten.js';
import { serverVon } from './server.js';
import { ChannelType, discordClient, gilde, kanal, mitglied, mockDiscord, pngBild, R, schliesse, type MockDiscord } from '../testhilfe.js';

// Die Discord-Schicht für Mitglieder, Textkanäle und Nachrichten gegen die
// gemockte API. Alle IDs sind erfunden. Siehe docs/entwicklung/tests.md, „Die gemockte API“.
const SERVER = '300000000000000011';
const NEU = '200000000000000061';
const K = {
  gruss: '500000000000000041',
  stumm: '500000000000000042',
  ohneDateien: '500000000000000043',
  ansage: '500000000000000044',
  sprache: '500000000000000045',
  geheim: '500000000000000046',
};

describe('Nachrichten in der Discord-Schicht', () => {
  let mock: MockDiscord;
  let client: Client;
  let guild: Guild;

  before(async () => {
    mock = await mockDiscord();
    client = discordClient(mock, [
      gilde(SERVER, 'Probe *Server*', '200000000000000099', [
        kanal(K.gruss, ChannelType.GuildText, 'willkommen', 0, null),
        kanal(K.stumm, ChannelType.GuildText, 'stumm', 1, null, R.SendMessages),
        kanal(K.ohneDateien, ChannelType.GuildText, 'ohne-dateien', 2, null, R.AttachFiles),
        kanal(K.ansage, ChannelType.GuildAnnouncement, 'ansagen', 3, null),
        kanal(K.sprache, ChannelType.GuildVoice, 'sprache', 4, null),
        kanal(K.geheim, ChannelType.GuildText, 'geheim', 5, null, R.ViewChannel),
      ]),
    ]);
    guild = client.guilds.cache.get(SERVER) as Guild;
  });

  beforeEach(() => {
    mock.nachrichten.length = 0;
    mock.nachrichtFehler = undefined;
  });

  after(async () => {
    await schliesse(mock);
    await client.destroy();
  });

  const ziel = (id: string) => {
    const k = textkanal(serverVon(guild), id);
    if (!k) throw new Error(`kein Textkanal ${id}`);
    return k;
  };

  test('textkanal: nur Text- und Ankündigungskanäle, in denen der Bot sehen und senden darf; anhaengen mit „Dateien anhängen“', () => {
    assert.deepEqual([ziel(K.gruss).name, ziel(K.gruss).anhaengen], ['willkommen', true]);
    assert.deepEqual([ziel(K.ansage).name, ziel(K.ansage).anhaengen], ['ansagen', true]);
    assert.equal(ziel(K.ohneDateien).anhaengen, false);
    for (const id of [K.stumm, K.geheim, K.sprache, '500000000000000099']) assert.equal(textkanal(serverVon(guild), id), undefined, id);
  });

  test('textkanalAuf findet den Kanal über die IDs, auf einem fremden Server nichts', () => {
    const finde = textkanalAuf(client);
    assert.equal(finde(SERVER, K.gruss)?.name, 'willkommen');
    assert.equal(finde(SERVER, K.stumm), undefined);
    assert.equal(finde('300000000000000099', K.gruss), undefined);
  });

  test('sende: Text, der nur die genannten pingt; ohne `pingt` niemanden', async () => {
    await ziel(K.gruss).sende({ text: `Hallo <@${NEU}> @everyone`, pingt: [NEU] });
    await ziel(K.gruss).sende({ text: 'Ohne Ping' });
    assert.deepEqual(
      mock.nachrichten.map((n) => [n.kanal, n.json.content, n.json.allowed_mentions, n.dateien.length]),
      [
        [K.gruss, `Hallo <@${NEU}> @everyone`, { parse: [], users: [NEU] }, 0],
        [K.gruss, 'Ohne Ping', { parse: [] }, 0],
      ],
    );
  });

  test('sende mit Datei: Multipart mit Name und Bytes; ohne Text kein content', async () => {
    const png = pngBild(1100, 440);
    await ziel(K.gruss).sende({ datei: { name: 'beitritt.png', daten: png } });
    const [n] = mock.nachrichten;
    assert.equal(n?.json.content, undefined);
    assert.deepEqual(n?.dateien.map((d) => d.name), ['beitritt.png']);
    assert.ok(n?.dateien[0]?.daten.equals(png));
    assert.deepEqual(n?.json.allowed_mentions, { parse: [] });
  });

  test('Fehler von Discord werden eigene Codes; die Meldung bleibt', async () => {
    const faelle: [[number, number], string][] = [
      [[403, 50013], 'kein_recht'],
      [[403, 50001], 'kein_recht'],
      [[404, 10003], 'nicht_gefunden'],
      [[400, 50035], 'anderes'],
    ];
    for (const [fehler, code] of faelle) {
      mock.nachrichtFehler = fehler;
      await assert.rejects(ziel(K.gruss).sende({ text: 'x' }), (e: unknown) => e instanceof DiscordFehler && e.code === code && e.message === 'Fehler');
    }
  });

  test('alsMitglied: Spitzname vor globalem Namen, der Benutzername, Avatar als PNG mit 256 px, Server mit Name und Zahl', () => {
    const m = (guild.members as unknown as { _add(d: unknown): GuildMember })._add(mitglied(NEU, [], { nick: 'Nick', global_name: 'Global', avatar: 'abc123' }));
    assert.deepEqual(alsMitglied(m), {
      id: NEU,
      name: 'Nick',
      benutzername: `nutzer-${NEU.slice(-2)}`,
      avatar: `${mock.url}/cdn/avatars/${NEU}/abc123.png?size=256`,
      server: { id: SERVER, name: 'Probe *Server*', anzahl: 42 },
    });
  });

  test('alsMitglied: ein Mitglied ausserhalb des Caches, wie beim Abschied, mit globalem Namen', () => {
    const partial = (guild.members as unknown as { _add(d: unknown): GuildMember })._add({
      user: { id: NEU, username: 'nutzer-61', global_name: 'Globaler Name' },
    });
    assert.equal(partial.partial, true);
    const m = alsMitglied(partial);
    assert.deepEqual([m.name, m.benutzername], ['Globaler Name', 'nutzer-61']);
    assert.ok(m.avatar.startsWith(`${mock.url}/cdn/`), m.avatar);
  });
});
