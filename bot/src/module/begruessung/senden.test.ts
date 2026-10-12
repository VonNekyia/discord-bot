import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test, type TestContext } from 'node:test';
import { fileURLToPath } from 'node:url';
import type { Client, Guild, GuildMember } from 'discord.js';
import type { Pool } from 'pg';
import { bereiteVor, masse } from './banner.js';
import { lese, speichere, speichereBild, standard, type Art, type Einstellung } from './begruessung.js';
import { ladeCache } from '../../kern/cache.js';
import { migriere, oeffne, verbindung } from '../../kern/datenbank.js';
import { Zaehlung } from '../../kern/zaehlung.js';
import { begruesse, Bremse, erstelleBremse, Plaetze, zusammenfassung } from './senden.js';
import { ChannelType, discordClient, gilde, kanal, mitglied, mockDiscord, pngBild, R, schliesse, type MockDiscord } from '../../testhilfe.js';

// Gegen eine gemockte Discord-API und eine echte PostgreSQL; ohne DB_HOST
// übersprungen, in der CI immer dabei. Alle IDs sind erfunden.
// Siehe docs/entwicklung/tests.md, „Die API des Dashboards“.
const ziel = verbindung();
if (!ziel && process.env.CI) throw new Error('In der CI muss die Datenbank da sein: DB_* fehlt.');

const SERVER = '300000000000000007';
const NEU = '200000000000000011';
const K = { gruss: '500000000000000031', stumm: '500000000000000032', ohneDateien: '500000000000000033' };

test('Plaetze lässt höchstens zwei zugleich laufen, die anderen der Reihe nach', async () => {
  const plaetze = new Plaetze(2);
  let laufend = 0;
  let hoechstens = 0;
  const reihenfolge: number[] = [];
  const freigaben: (() => void)[] = [];
  const alle = [1, 2, 3, 4, 5].map((n) =>
    plaetze.nutze(async () => {
      laufend++;
      hoechstens = Math.max(hoechstens, laufend);
      reihenfolge.push(n);
      await new Promise<void>((frei) => freigaben.push(frei));
      laufend--;
    }),
  );
  await new Promise(setImmediate);
  assert.deepEqual([laufend, reihenfolge], [2, [1, 2]]);
  while (freigaben.length > 0) {
    freigaben.shift()?.();
    await new Promise(setImmediate);
  }
  await Promise.all(alle);
  assert.deepEqual([hoechstens, reihenfolge], [2, [1, 2, 3, 4, 5]]);
});

test('die Bremse greift beim 6. Ereignis in 10 s und löst sich nach 30 s Ruhe, mit falschen Uhren', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const geloest: [string, number][] = [];
  const bremse = new Bremse<string>((daten, zahl) => geloest.push([daten, zahl]));
  const staende = Array.from({ length: 7 }, () => bremse.zaehle('a', 'Server A'));
  assert.deepEqual(staende, ['einzeln', 'einzeln', 'einzeln', 'einzeln', 'einzeln', 'an', 'gezaehlt']);
  t.mock.timers.tick(20_000);
  assert.equal(bremse.zaehle('a', 'Server A'), 'gezaehlt');
  t.mock.timers.tick(29_999);
  assert.deepEqual(geloest, []);
  t.mock.timers.tick(1);
  assert.deepEqual(geloest, [['Server A', 3]]);
  assert.equal(bremse.zaehle('a', 'Server A'), 'einzeln');
});

test('die Bremse zählt im Fenster von 10 s: verteilte Ereignisse gehen einzeln', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const bremse = new Bremse<string>(() => {});
  const staende = Array.from({ length: 8 }, () => {
    const stand = bremse.zaehle('a', 'x');
    t.mock.timers.tick(2_100);
    return stand;
  });
  assert.ok(staende.every((stand) => stand === 'einzeln'), staende.join());
  assert.deepEqual(Array.from({ length: 6 }, () => bremse.zaehle('b', 'y')).at(-1), 'an');
});

test('die Zusammenfassung sagt eins oder mehrere', () => {
  assert.equal(zusammenfassung('beitritt', 1), 'Willkommen an das neue Mitglied!');
  assert.equal(zusammenfassung('beitritt', 12), 'Willkommen an die 12 neuen Mitglieder!');
  assert.equal(zusammenfassung('abschied', 1), '1 Mitglied hat den Server verlassen.');
  assert.equal(zusammenfassung('abschied', 3), '3 Mitglieder haben den Server verlassen.');
});

describe('Senden bei Beitritt und Abschied', { skip: ziel ? false : 'keine Datenbank, DB_HOST fehlt' }, () => {
  let db: Pool;
  let mock: MockDiscord;
  let client: Client;
  let guild: Guild;

  before(async () => {
    if (!ziel) return;
    await migriere(ziel, fileURLToPath(new URL('../../../migrationen', import.meta.url)));
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

  // Ein Kontext mit einer Bremse, die über den ganzen Test lebt. Ihre Ruhe
  // ist 200 ms statt 30 s: Mit falschen Uhren hängen REST und fetch, darum
  // laufen die Zeiten hier echt. Die Zeiten selbst prüfen die Tests der Bremse oben.
  const mitBremse = () => {
    const einstellungen = ladeCache((server: string) => lese(db, server));
    return { db, einstellungen, bremse: erstelleBremse({ einstellungen }, 200) };
  };
  // Alle Logzeilen, aus console.log und console.error.
  const alleZeilen = (t: TestContext) => {
    const zeilen: string[] = [];
    for (const art of ['log', 'error'] as const) t.mock.method(console, art, (zeile: unknown) => zeilen.push(String(zeile)));
    return zeilen;
  };
  // Wartet höchstens 3 s, bis der Mock `zahl` Nachrichten hat.
  const bisNachrichten = async (zahl: number) => {
    for (let i = 0; i < 300 && mock.nachrichten.length < zahl; i++) await new Promise((weiter) => setTimeout(weiter, 10));
  };

  test('beim Raid gehen 5 einzeln, dann zählt die Bremse; nach der Ruhe kommt die Zusammenfassung ohne Ping und Banner', async (t) => {
    const zeilen = alleZeilen(t);
    await stelle('beitritt', { an: true, kanal: K.gruss, text: 'Hallo {nutzer}', banner: true });
    await speichereBild(db, SERVER, 'beitritt', await bereiteVor(pngBild(400, 300)));
    const zaehlung = new Zaehlung({ log: () => {} });
    const k = { ...mitBremse(), zaehlung };
    for (let i = 0; i < 7; i++) await begruesse(neu({ global_name: `Gast ${i}` }), 'beitritt', k);
    // Die Bremse greift einmal, nicht je gezähltem Beitritt.
    assert.equal(zaehlung.stand([0]).eigene.find((e) => e.name === 'bremse')?.gegriffen, 1);
    assert.equal(mock.nachrichten.length, 5);
    assert.ok(mock.nachrichten.every((n) => n.dateien.length === 1));

    await bisNachrichten(6);
    const z = mock.nachrichten[5];
    assert.equal(z?.json.content, 'Willkommen an die 2 neuen Mitglieder!');
    assert.deepEqual(z?.json.allowed_mentions, { parse: [] });
    assert.deepEqual(z?.dateien, []);
    assert.deepEqual(
      zeilen.filter((zeile) => zeile.includes('Bremse')),
      ['Begrüssung beitritt: Bremse an.', 'Begrüssung beitritt: Bremse aus, 2 gezählt.'],
    );
    // Nach dem Lösen geht die nächste wieder einzeln.
    await begruesse(neu(), 'beitritt', k);
    assert.equal(mock.nachrichten.length, 7);
  });

  test('ein gezählter Abschied gibt die Zusammenfassung im Singular', async (t) => {
    alleZeilen(t);
    await stelle('abschied', { an: true, kanal: K.gruss, text: '{name} ist weg.' });
    const k = mitBremse();
    for (let i = 0; i < 6; i++) await begruesse(neu(), 'abschied', k);
    await bisNachrichten(6);
    assert.equal(mock.nachrichten[5]?.json.content, '1 Mitglied hat den Server verlassen.');
  });

  test('bei ausgeschalteter Art zählt die Bremse nicht', async (t) => {
    alleZeilen(t);
    await stelle('beitritt', { an: false, kanal: K.gruss, text: 'Hallo' });
    const k = mitBremse();
    for (let i = 0; i < 10; i++) await begruesse(neu(), 'beitritt', k);
    await stelle('beitritt', { an: true, kanal: K.gruss, text: 'Hallo' });
    k.einstellungen.delete(SERVER);
    await begruesse(neu(), 'beitritt', k);
    assert.deepEqual(
      mock.nachrichten.map((n) => n.json.content),
      ['Hallo'],
    );
    await new Promise((weiter) => setTimeout(weiter, 400));
    assert.equal(mock.nachrichten.length, 1);
  });
});
