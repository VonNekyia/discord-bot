import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test, type TestContext } from 'node:test';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';
import { bereiteVor, masse } from './banner.js';
import { lese, speichere, speichereBild, standard, type Art, type Einstellung } from './begruessung.js';
import { ladeCache } from '../../kern/cache.js';
import { migriere, oeffne, verbindung } from '../../kern/datenbank.js';
import { Zaehlung } from '../../kern/zaehlung.js';
import { begruessungsModul } from './modul.js';
import { begruesse, Bremse, erstelleBremse, Plaetze, zusammenfassung } from './senden.js';
import { pngBild } from '../../testhilfe.js';
import { DiscordFehler } from '../../discord/fehler.js';
import type { Mitglied, Nachricht, Textkanal } from '../../discord/nachrichten.js';

// Gegen eine Fälschung der Discord-Schicht und eine echte PostgreSQL; ohne
// DB_HOST übersprungen, in der CI immer dabei. Alle IDs sind erfunden.
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
  // Was die falschen Kanäle bekommen haben.
  let gesendet: { kanal: string; n: Nachricht }[] = [];
  // Die Kanäle, in denen der Bot senden darf; K.stumm fehlt, dort darf er nicht.
  let kanaele = new Map<string, Textkanal>();
  const avatare: string[] = [];

  before(async () => {
    if (!ziel) return;
    await migriere(ziel, fileURLToPath(new URL('../../../migrationen', import.meta.url)));
    db = oeffne(ziel);
  });

  beforeEach(async () => {
    if (!ziel) return;
    gesendet = [];
    kanaele = new Map([
      [K.gruss, falscherKanal(K.gruss, 'willkommen', true)],
      [K.ohneDateien, falscherKanal(K.ohneDateien, 'ohne-dateien', false)],
    ]);
    await db.query('DELETE FROM begruessungen WHERE server = $1', [SERVER]);
    await db.query('DELETE FROM bilder WHERE server = $1', [SERVER]);
  });

  after(async () => {
    if (!ziel) return;
    await db.query('DELETE FROM begruessungen WHERE server = $1', [SERVER]);
    await db.query('DELETE FROM bilder WHERE server = $1', [SERVER]);
    await db.end();
  });

  // Ein Textkanal wie aus der Discord-Schicht, der sich merkt, was er senden soll.
  function falscherKanal(id: string, name: string, anhaengen: boolean): Textkanal {
    return {
      name,
      anhaengen,
      async sende(n) {
        gesendet.push({ kanal: id, n });
      },
    };
  }
  // Jeder Aufruf mit frischem Cache, damit kein Test den Stand eines anderen liest.
  const kontext = () => ({
    db,
    einstellungen: ladeCache((server: string) => lese(db, server)),
    kanal: (server: string, id: string) => (server === SERVER ? kanaele.get(id) : undefined),
    avatar: async (url: string) => {
      avatare.push(url);
      return pngBild(64, 64);
    },
  });
  const stelle = (art: Art, e: Partial<Einstellung>) => speichere(db, SERVER, art, { ...standard(art), ...e });
  // Ein Mitglied, wie `alsMitglied` es aus der Discord-Schicht liefert.
  const neu = (name = 'nutzer-11'): Mitglied => ({
    id: NEU,
    name,
    avatar: `https://cdn.example/avatars/${NEU}.png?size=256`,
    server: { id: SERVER, name: 'Probe *Server*', anzahl: 42 },
  });
  const logZeilen = (t: TestContext) => t.mock.method(console, 'error', () => {});

  test('Beitritt: Platzhalter im Text maskiert, nur das neue Mitglied pingt', async () => {
    await stelle('beitritt', { an: true, kanal: K.gruss, text: 'Hallo {nutzer} ({name}) auf {server}, Nr. {anzahl}! {Name}' });
    await begruesse(neu('**Nick**'), 'beitritt', kontext());
    assert.deepEqual(gesendet, [
      { kanal: K.gruss, n: { text: `Hallo <@${NEU}> (\\*\\*Nick\\*\\*) auf Probe \\*Server\\*, Nr. 42! {Name}`, pingt: [NEU] } },
    ]);
  });

  test('das Modul gibt Beitritt und Abschied an begruesse, je mit seiner Art und eigenem Cache', async () => {
    await stelle('beitritt', { an: true, kanal: K.gruss, text: 'Hallo {name}.' });
    await stelle('abschied', { an: true, kanal: K.gruss, text: 'Tschüss {name}.' });
    const { ereignisse } = begruessungsModul({ db, zaehlung: new Zaehlung(), kanal: kontext().kanal });
    await ereignisse?.beitritt?.(neu('Mia'));
    await ereignisse?.abschied?.(neu('Mia'));
    assert.deepEqual(
      gesendet.map((g) => g.n.text),
      ['Hallo Mia.', 'Tschüss Mia.'],
    );
  });

  test('Abschied: der Name, den die Schicht liefert, und niemand pingt', async () => {
    await stelle('abschied', { an: true, kanal: K.gruss, text: '{name} ist weg. {nutzer}' });
    await begruesse(neu('Globaler Name'), 'abschied', kontext());
    assert.deepEqual(gesendet, [{ kanal: K.gruss, n: { text: `Globaler Name ist weg. <@${NEU}>`, pingt: [] } }]);
  });

  test('darf der Bot im Kanal nicht senden, schickt er nichts; das Log nennt keine ID und keinen Namen', async (t) => {
    const log = logZeilen(t);
    await stelle('beitritt', { an: true, kanal: K.stumm, text: 'Hallo {name}' });
    await begruesse(neu('Geheimname'), 'beitritt', kontext());
    assert.deepEqual(gesendet, []);
    const zeilen = log.mock.calls.map((c) => String(c.arguments[0]));
    assert.deepEqual(zeilen, ['Begrüssung beitritt: Kanal fehlt oder der Bot darf dort nicht senden.']);
  });

  test('scheitert das Senden, steht eine Zeile im Log, ohne ID und Namen', async (t) => {
    const log = logZeilen(t);
    await stelle('beitritt', { an: true, kanal: K.gruss, text: 'Hallo {name}' });
    kanaele.set(K.gruss, {
      name: 'willkommen',
      anhaengen: true,
      sende: async () => {
        throw new DiscordFehler('kein_recht', 'Missing Permissions');
      },
    });
    await begruesse(neu('Geheimname'), 'beitritt', kontext());
    const zeilen = log.mock.calls.map((c) => String(c.arguments[0]));
    assert.deepEqual(zeilen, ['Begrüssung beitritt: nicht gesendet: Missing Permissions']);
  });

  test('mit Banner hängt der Bot beitritt.png mit 1100 × 440 an, mit dem Avatar des Mitglieds', async () => {
    await stelle('beitritt', { an: true, kanal: K.gruss, text: 'Hallo {name}', banner: true, bannerText: 'Willkommen, {name}!' });
    await speichereBild(db, SERVER, 'beitritt', await bereiteVor(pngBild(400, 300)));
    await begruesse(neu('Mia'), 'beitritt', kontext());
    const [g] = gesendet;
    assert.equal(g?.n.text, 'Hallo Mia');
    assert.equal(g?.n.datei?.name, 'beitritt.png');
    assert.deepEqual(masse(g?.n.datei?.daten ?? Buffer.alloc(0)), { breite: 1100, hoehe: 440 });
    assert.equal(avatare.at(-1), neu().avatar);
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
      gesendet.map((g) => [g.kanal, g.n.text, g.n.datei]),
      [
        [K.gruss, 'Hallo', undefined],
        [K.ohneDateien, 'Hallo', undefined],
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
    assert.deepEqual(gesendet, []);
    assert.equal(log.mock.callCount(), 0);
  });

  // Ein Kontext mit einer Bremse, die über den ganzen Test lebt, mit den
  // echten 30 s Ruhe. Ohne Netz gehen falsche Uhren; siehe docs/entwicklung/tests.md, „Falsche Uhren“.
  const mitBremse = () => {
    const k = kontext();
    return { ...k, bremse: erstelleBremse(k) };
  };
  // Alle Logzeilen, aus console.log und console.error.
  const alleZeilen = (t: TestContext) => {
    const zeilen: string[] = [];
    for (const art of ['log', 'error'] as const) t.mock.method(console, art, (zeile: unknown) => zeilen.push(String(zeile)));
    return zeilen;
  };
  // Lässt die Zusammenfassung laufen: Sie liest die Datenbank, darum echte Runden der Ereignisschleife.
  const bis = async (fertig: () => boolean) => {
    for (let i = 0; i < 1000 && !fertig(); i++) await new Promise((weiter) => setImmediate(weiter));
  };

  test('beim Raid gehen 5 einzeln, dann zählt die Bremse; nach 30 s Ruhe kommt die Zusammenfassung ohne Ping und Banner', async (t) => {
    const zeilen = alleZeilen(t);
    await stelle('beitritt', { an: true, kanal: K.gruss, text: 'Hallo {nutzer}', banner: true });
    await speichereBild(db, SERVER, 'beitritt', await bereiteVor(pngBild(400, 300)));
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
    const zaehlung = new Zaehlung({ log: () => {} });
    const k = { ...mitBremse(), zaehlung };
    for (let i = 0; i < 7; i++) await begruesse(neu(`Gast ${i}`), 'beitritt', k);
    // Die Bremse greift einmal, nicht je gezähltem Beitritt.
    assert.equal(zaehlung.stand([0]).eigene.find((e) => e.name === 'bremse')?.gegriffen, 1);
    assert.equal(gesendet.length, 5);
    assert.ok(gesendet.every((g) => g.n.datei?.name === 'beitritt.png'));

    t.mock.timers.tick(29_999);
    await bis(() => gesendet.length >= 6);
    assert.equal(gesendet.length, 5);
    t.mock.timers.tick(1);
    await bis(() => gesendet.length >= 6);
    assert.deepEqual(gesendet[5], { kanal: K.gruss, n: { text: 'Willkommen an die 2 neuen Mitglieder!' } });
    assert.deepEqual(
      zeilen.filter((zeile) => zeile.includes('Bremse')),
      ['Begrüssung beitritt: Bremse an.', 'Begrüssung beitritt: Bremse aus, 2 gezählt.'],
    );
    // Nach dem Lösen geht die nächste wieder einzeln.
    await begruesse(neu(), 'beitritt', k);
    assert.equal(gesendet.length, 7);
  });

  test('ein gezählter Abschied gibt die Zusammenfassung im Singular', async (t) => {
    alleZeilen(t);
    await stelle('abschied', { an: true, kanal: K.gruss, text: '{name} ist weg.' });
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
    const k = mitBremse();
    for (let i = 0; i < 6; i++) await begruesse(neu(), 'abschied', k);
    t.mock.timers.tick(30_000);
    await bis(() => gesendet.length >= 6);
    assert.equal(gesendet[5]?.n.text, '1 Mitglied hat den Server verlassen.');
  });

  test('ist der Kanal beim Lösen weg, kommt keine Zusammenfassung, und nichts wirft', async (t) => {
    const zeilen = alleZeilen(t);
    const unbehandelt: unknown[] = [];
    const merke = (fehler: unknown) => unbehandelt.push(fehler);
    process.on('unhandledRejection', merke);
    t.after(() => process.off('unhandledRejection', merke));
    await stelle('beitritt', { an: true, kanal: K.gruss, text: 'Hallo' });
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
    const k = mitBremse();
    for (let i = 0; i < 6; i++) await begruesse(neu(), 'beitritt', k);
    // In den 30 s nimmt jemand dem Bot das Recht, dort zu senden.
    kanaele.delete(K.gruss);
    t.mock.timers.tick(30_000);
    await bis(() => zeilen.some((z) => z.includes('Kanal fehlt')));
    assert.equal(gesendet.length, 5);
    assert.deepEqual(zeilen.slice(-2), ['Begrüssung beitritt: Bremse aus, 1 gezählt.', 'Begrüssung beitritt: Kanal fehlt oder der Bot darf dort nicht senden.']);
    await bis(() => false);
    assert.deepEqual(unbehandelt, []);
  });

  test('bei ausgeschalteter Art zählt die Bremse nicht', async (t) => {
    alleZeilen(t);
    await stelle('beitritt', { an: false, kanal: K.gruss, text: 'Hallo' });
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
    const k = mitBremse();
    for (let i = 0; i < 10; i++) await begruesse(neu(), 'beitritt', k);
    await stelle('beitritt', { an: true, kanal: K.gruss, text: 'Hallo' });
    k.einstellungen.delete(SERVER);
    await begruesse(neu(), 'beitritt', k);
    assert.deepEqual(
      gesendet.map((g) => g.n.text),
      ['Hallo'],
    );
    t.mock.timers.tick(30_000);
    await bis(() => gesendet.length > 1);
    assert.equal(gesendet.length, 1);
  });
});
