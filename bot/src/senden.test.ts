import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test, type TestContext } from 'node:test';
import { fileURLToPath } from 'node:url';
import type { Client, Guild, GuildMember } from 'discord.js';
import type { Pool } from 'pg';
import { bereiteVor, masse } from './banner.js';
import { lese, speichere, speichereBild, standard, type Art, type Einstellung } from './begruessung.js';
import { ladeCache } from './cache.js';
import { migriere, oeffne, verbindung } from './datenbank.js';
import { begruesse } from './senden.js';
import { ChannelType, discordClient, gilde, kanal, mitglied, mockDiscord, pngBild, R, schliesse, type MockDiscord } from './testhilfe.js';

// Gegen eine gemockte Discord-API und eine echte PostgreSQL; ohne DB_HOST
// übersprungen, in der CI immer dabei. Alle IDs sind erfunden.
// Siehe docs/entwicklung/tests.md, „Die API des Dashboards“.
const ziel = verbindung();
if (!ziel && process.env.CI) throw new Error('In der CI muss die Datenbank da sein: DB_* fehlt.');

const SERVER = '300000000000000007';
const NEU = '200000000000000011';
const K = { gruss: '500000000000000031', stumm: '500000000000000032', ohneDateien: '500000000000000033' };

describe('Senden bei Beitritt und Abschied', { skip: ziel ? false : 'keine Datenbank, DB_HOST fehlt' }, () => {
  let db: Pool;
  let mock: MockDiscord;
  let client: Client;
  let guild: Guild;

  before(async () => {
    if (!ziel) return;
    await migriere(ziel, fileURLToPath(new URL('../migrationen', import.meta.url)));
    db = oeffne(ziel);
    mock = await mockDiscord();
    client = discordClient(mock, [
      gilde(SERVER, 'Probe *Server*', '200000000000000099', [
        kanal(K.gruss, ChannelType.GuildText, 'willkommen', 0, null),
        kanal(K.stumm, ChannelType.GuildText, 'stumm', 1, null, R.SendMessages),
        kanal(K.ohneDateien, ChannelType.GuildText, 'ohne-dateien', 2, null, R.AttachFiles),
      ]),
    ]);
    guild = client.guilds.cache.get(SERVER) as Guild;
  });

  beforeEach(async () => {
    if (!ziel) return;
    mock.nachrichten.length = 0;
    await db.query('DELETE FROM begruessungen WHERE server = $1', [SERVER]);
    await db.query('DELETE FROM bilder WHERE server = $1', [SERVER]);
  });

  after(async () => {
    if (!ziel) return;
    await db.query('DELETE FROM begruessungen WHERE server = $1', [SERVER]);
    await db.query('DELETE FROM bilder WHERE server = $1', [SERVER]);
    await schliesse(mock);
    await client.destroy();
    await db.end();
  });

  // Jeder Aufruf mit frischem Cache, damit kein Test den Stand eines anderen liest.
  const kontext = () => ({ db, einstellungen: ladeCache((server: string) => lese(db, server)) });
  const stelle = (art: Art, e: Partial<Einstellung>) => speichere(db, SERVER, art, { ...standard(art), ...e });
  const neu = (weiter: Parameters<typeof mitglied>[2] = {}) =>
    (guild.members as unknown as { _add(d: unknown): GuildMember })._add(mitglied(NEU, [], weiter));
  const logZeilen = (t: TestContext) => t.mock.method(console, 'error', () => {});

  test('Beitritt: Platzhalter im Text maskiert, nur das neue Mitglied pingt', async () => {
    await stelle('beitritt', { an: true, kanal: K.gruss, text: 'Hallo {nutzer} ({name}) auf {server}, Nr. {anzahl}! {Name}' });
    await begruesse(neu({ nick: '**Nick**', global_name: 'Global' }), 'beitritt', kontext());
    assert.equal(mock.nachrichten.length, 1);
    const [n] = mock.nachrichten;
    assert.equal(n?.kanal, K.gruss);
    assert.equal(n?.json.content, `Hallo <@${NEU}> (\\*\\*Nick\\*\\*) auf Probe \\*Server\\*, Nr. 42! {Name}`);
    assert.deepEqual(n?.json.allowed_mentions, { parse: [], users: [NEU] });
    assert.deepEqual(n?.dateien, []);
  });

  test('Abschied eines Mitglieds ausserhalb des Caches: globaler Anzeigename, niemand pingt', async () => {
    await stelle('abschied', { an: true, kanal: K.gruss, text: '{name} ist weg. {nutzer}' });
    const partial = (guild.members as unknown as { _add(d: unknown): GuildMember })._add({
      user: { id: NEU, username: 'nutzer-11', global_name: 'Globaler Name' },
    });
    assert.equal(partial.partial, true);
    await begruesse(partial, 'abschied', kontext());
    assert.equal(mock.nachrichten[0]?.json.content, `Globaler Name ist weg. <@${NEU}>`);
    assert.deepEqual(mock.nachrichten[0]?.json.allowed_mentions, { parse: [] });
  });

  test('darf der Bot im Kanal nicht senden, schickt er nichts; das Log nennt keine ID und keinen Namen', async (t) => {
    const log = logZeilen(t);
    await stelle('beitritt', { an: true, kanal: K.stumm, text: 'Hallo {name}' });
    await begruesse(neu({ global_name: 'Geheimname' }), 'beitritt', kontext());
    assert.equal(mock.nachrichten.length, 0);
    const zeilen = log.mock.calls.map((c) => String(c.arguments[0]));
    assert.deepEqual(zeilen, ['Begrüssung beitritt: Kanal fehlt oder der Bot darf dort nicht senden.']);
  });

  test('mit Banner hängt der Bot beitritt.png mit 1100 × 440 an', async () => {
    await stelle('beitritt', { an: true, kanal: K.gruss, text: 'Hallo {name}', banner: true, bannerText: 'Willkommen, {name}!' });
    await speichereBild(db, SERVER, 'beitritt', await bereiteVor(pngBild(400, 300)));
    const avatare = mock.avatare.length;
    await begruesse(neu({ global_name: 'Mia' }), 'beitritt', kontext());
    const [n] = mock.nachrichten;
    assert.equal(n?.json.content, 'Hallo Mia');
    assert.deepEqual(n?.dateien.map((d) => d.name), ['beitritt.png']);
    assert.deepEqual(masse(n?.dateien[0]?.daten ?? Buffer.alloc(0)), { breite: 1100, hoehe: 440 });
    assert.equal(mock.avatare.length, avatare + 1);
  });

  test('scheitert das Banner oder fehlt „Dateien anhängen“, geht nur der Text', async (t) => {
    const log = logZeilen(t);
    await stelle('beitritt', { an: true, kanal: K.gruss, text: 'Hallo', banner: true });
    await speichereBild(db, SERVER, 'beitritt', Buffer.from('kein Bild'));
    await begruesse(neu(), 'beitritt', kontext());
    await speichereBild(db, SERVER, 'beitritt', await bereiteVor(pngBild(400, 300)));
    await stelle('beitritt', { an: true, kanal: K.ohneDateien, text: 'Hallo', banner: true });
    await begruesse(neu(), 'beitritt', kontext());
    assert.deepEqual(
      mock.nachrichten.map((n) => [n.kanal, n.json.content, n.dateien.length]),
      [
        [K.gruss, 'Hallo', 0],
        [K.ohneDateien, 'Hallo', 0],
      ],
    );
    const zeilen = log.mock.calls.map((c) => String(c.arguments[0]));
    assert.equal(zeilen.length, 2);
    assert.match(zeilen[0] ?? '', /^Begrüssung beitritt: Banner gescheitert, nur der Text: /);
    assert.equal(zeilen[1], 'Begrüssung beitritt: Banner ohne „Dateien anhängen“, nur der Text.');
    for (const zeile of zeilen) assert.doesNotMatch(zeile, /\d{17}/);
  });

  test('leerer Text ohne Banner schickt nichts, eine ausgeschaltete Begrüssung auch nicht, beides ohne Log', async (t) => {
    const log = logZeilen(t);
    await stelle('beitritt', { an: true, kanal: K.gruss, text: '  ' });
    await begruesse(neu(), 'beitritt', kontext());
    await stelle('beitritt', { an: false, kanal: K.gruss, text: 'Hallo' });
    await begruesse(neu(), 'beitritt', kontext());
    await begruesse(neu(), 'abschied', kontext());
    assert.equal(mock.nachrichten.length, 0);
    assert.equal(log.mock.callCount(), 0);
  });
});
