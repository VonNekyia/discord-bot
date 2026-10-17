import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import { setTimeout as warte } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import type { Client } from 'discord.js';
import type { Pool } from 'pg';
import { BausteinFehler } from '../kern/baukasten.js';
import { migriere, oeffne, verbindung } from '../kern/datenbank.js';
import { kaeufeVon } from '../discord/kaeufe.js';
import { ANWENDUNG, PERSON, abo, discordClient, einmalkauf, mockDiscord, schliesse, type MockDiscord } from '../testhilfe.js';
import { Freischaltung, type FreischaltungOptionen } from './freischaltung.js';

// Die Freischaltung gegen eine echte PostgreSQL und die gemockte API; ohne
// DB_HOST übersprungen. Alle IDs sind erfunden.
// Siehe docs/entscheidungen/0020-bezahlte-module.md.
const ziel = verbindung();
const SERVER = '300000000000000101';
const ANDERER = '300000000000000102';
// Bei zwei Shards liegen SERVER und ANDERER auf Shard 0, DRITTER auf Shard 1:
// (ID >> 22) % 2.
const DRITTER = '300000000004194405';
const SKU = '500000000000000001';
const ALLES = '500000000000000002';
const LOG = '500000000000000003';
const KAUF_1 = '510000000000000001';
const KAUF_2 = '510000000000000002';
const ABO = '520000000000000001';

const fehler = (code: string, status = 400) => (e: unknown) => e instanceof BausteinFehler && e.code === code && e.status === status;

describe('Freischaltung', { skip: ziel ? false : 'keine Datenbank, DB_HOST fehlt' }, () => {
  let db: Pool;
  let mock: MockDiscord;
  let client: Client;
  const baue = (weiter: Partial<FreischaltungOptionen> = {}) =>
    new Freischaltung({
      db,
      kaeufe: kaeufeVon(client),
      einmalkauf: new Map([['strafen', SKU]]),
      abos: [
        { sku: ALLES, module: ['strafen', 'log'] },
        { sku: LOG, module: ['log'] },
      ],
      ...weiter,
    });
  const gebunden = async () =>
    (
      await db.query<{ entitlement: string; server: string; sku: string; verbraucht: boolean }>(
        'SELECT entitlement, server, sku, verbraucht FROM bindungen WHERE server = ANY($1) ORDER BY entitlement',
        [[SERVER, ANDERER, DRITTER]],
      )
    ).rows;
  const kauf = (id: string) => mock.kaeufe.find((k) => k.id === id);
  const listen = () => mock.anfragen.filter((a) => a.methode === 'GET' && a.pfad.includes('/entitlements?'));

  before(async () => {
    if (!ziel) return;
    await migriere(ziel, fileURLToPath(new URL('../../migrationen', import.meta.url)));
    db = oeffne(ziel);
    mock = await mockDiscord();
    client = discordClient(mock, []);
  });

  beforeEach(async () => {
    await db.query('DELETE FROM bindungen WHERE server = ANY($1)', [[SERVER, ANDERER, DRITTER]]);
    mock.kaeufe = [];
    mock.anfragen.length = 0;
    mock.kaeufeWarten = [];
    mock.kaeufeFolge = [];
    delete mock.kaeufeFehler;
    delete mock.verbrauchenFehler;
  });

  after(async () => {
    if (!ziel) return;
    await db.query('DELETE FROM bindungen WHERE server = ANY($1)', [[SERVER, ANDERER, DRITTER]]);
    await db.end();
    await client.destroy();
    await schliesse(mock);
  });

  test('binde bindet den ältesten freien Kauf: erst eintragen, dann verbrauchen', async () => {
    mock.kaeufe = [einmalkauf(KAUF_2, SKU, PERSON), einmalkauf(KAUF_1, SKU, PERSON)];
    const f = baue();
    assert.equal(await f.frei(SERVER, 'strafen'), false);
    await f.binde(SERVER, PERSON, 'strafen');
    assert.deepEqual(await gebunden(), [{ entitlement: KAUF_1, server: SERVER, sku: SKU, verbraucht: true }]);
    assert.equal(kauf(KAUF_1)?.consumed, true);
    assert.equal(kauf(KAUF_2)?.consumed, false);
    assert.equal(await f.frei(SERVER, 'strafen'), true);
    assert.equal(await f.frei(ANDERER, 'strafen'), false);
    const person = listen().find((a) => a.pfad.includes('user_id'));
    assert.match(person?.pfad ?? '', new RegExp(`user_id=${PERSON}&sku_ids=${SKU}`));
  });

  test('ein Kauf bindet nie zwei Server, auch nicht bei zwei Anfragen zugleich', async () => {
    mock.kaeufe = [einmalkauf(KAUF_1, SKU, PERSON)];
    const f = baue();
    const ergebnisse = await Promise.allSettled([f.binde(SERVER, PERSON, 'strafen'), f.binde(ANDERER, PERSON, 'strafen')]);
    assert.equal(ergebnisse.filter((e) => e.status === 'fulfilled').length, 1);
    const abgelehnt = ergebnisse.find((e) => e.status === 'rejected');
    assert.ok(abgelehnt?.status === 'rejected' && fehler('kein_kauf')(abgelehnt.reason));
    assert.equal((await gebunden()).length, 1);
  });

  test('zwei Anfragen zugleich für einen Server: eine bindet, die andere ist schon_freigeschaltet; der zweite Kauf bleibt frei', async () => {
    mock.kaeufe = [einmalkauf(KAUF_1, SKU, PERSON), einmalkauf(KAUF_2, SKU, PERSON)];
    const f = baue();
    const ergebnisse = await Promise.allSettled([f.binde(SERVER, PERSON, 'strafen'), f.binde(SERVER, PERSON, 'strafen')]);
    assert.equal(ergebnisse.filter((e) => e.status === 'fulfilled').length, 1);
    const abgelehnt = ergebnisse.find((e) => e.status === 'rejected');
    assert.ok(abgelehnt?.status === 'rejected' && fehler('schon_freigeschaltet')(abgelehnt.reason));
    assert.equal((await gebunden()).length, 1);
    assert.equal([kauf(KAUF_1)?.consumed, kauf(KAUF_2)?.consumed].filter(Boolean).length, 1);
  });

  test('schon über das Abo „Alles“ freigeschaltet: schon_freigeschaltet, der Kauf bleibt frei', async () => {
    mock.kaeufe = [abo(ABO, ALLES, SERVER), einmalkauf(KAUF_1, SKU, PERSON)];
    await assert.rejects(baue().binde(SERVER, PERSON, 'strafen'), fehler('schon_freigeschaltet'));
    assert.deepEqual(await gebunden(), []);
    assert.equal(kauf(KAUF_1)?.consumed, false);
  });

  test('kein freier Kauf: kein_kauf, auch wenn der einzige schon an einem anderen Server hängt', async () => {
    mock.kaeufe = [einmalkauf(KAUF_1, SKU, PERSON)];
    const f = baue();
    await assert.rejects(f.binde(SERVER, '200000000000000099', 'strafen'), fehler('kein_kauf'));
    await f.binde(ANDERER, PERSON, 'strafen');
    await assert.rejects(f.binde(SERVER, PERSON, 'strafen'), fehler('kein_kauf'));
  });

  test('scheitert das Verbrauchen, ist das Modul trotzdem frei; nachverbrauche holt es nach und loggt nur Zahlen', async (t) => {
    const log = t.mock.method(console, 'log', () => {});
    const fehlerLog = t.mock.method(console, 'error', () => {});
    mock.kaeufe = [einmalkauf(KAUF_1, SKU, PERSON)];
    mock.verbrauchenFehler = [500, 0];
    const f = baue();
    await f.binde(SERVER, PERSON, 'strafen');
    assert.equal(await f.frei(SERVER, 'strafen'), true);
    assert.deepEqual((await gebunden()).map((z) => z.verbraucht), [false]);
    delete mock.verbrauchenFehler;
    await f.nachverbrauche();
    assert.deepEqual((await gebunden()).map((z) => z.verbraucht), [true]);
    assert.equal(kauf(KAUF_1)?.consumed, true);
    const zeilen = [...log.mock.calls, ...fehlerLog.mock.calls].map((c) => String(c.arguments[0]));
    assert.ok(zeilen.includes('Käufe nachverbraucht: 1 von 1.'));
    for (const zeile of zeilen) for (const id of [KAUF_1, PERSON, SERVER, SKU]) assert.ok(!zeile.includes(id), zeile);
  });

  test('führt Discord den Kauf schon als verbraucht, vermerkt nachverbrauche es ohne zweites Verbrauchen', async (t) => {
    t.mock.method(console, 'log', () => {});
    mock.kaeufe = [{ ...einmalkauf(KAUF_1, SKU, PERSON), consumed: true }];
    await db.query('INSERT INTO bindungen (entitlement, server, sku) VALUES ($1, $2, $3)', [KAUF_1, SERVER, SKU]);
    await baue().nachverbrauche();
    assert.deepEqual((await gebunden()).map((z) => z.verbraucht), [true]);
    assert.ok(!mock.anfragen.some((a) => a.pfad.endsWith('/consume')));
  });

  test('liefert Discord die Käufe nicht, 5xx oder Abbruch: nicht_erreichbar; ein 429 wartet und klappt', async (t) => {
    t.mock.method(console, 'error', () => {});
    mock.kaeufe = [einmalkauf(KAUF_1, SKU, PERSON)];
    const f = baue({ abos: [] });
    mock.kaeufeFehler = 502;
    await assert.rejects(f.binde(SERVER, PERSON, 'strafen'), fehler('nicht_erreichbar', 503));
    mock.kaeufeFehler = 'abbruch';
    await assert.rejects(f.binde(SERVER, PERSON, 'strafen'), fehler('nicht_erreichbar', 503));
    assert.deepEqual(await gebunden(), []);
    delete mock.kaeufeFehler;
    mock.kaeufeWarten = [0];
    await f.binde(SERVER, PERSON, 'strafen');
    assert.equal((await gebunden()).length, 1);
    assert.equal(listen().filter((a) => a.pfad.includes('user_id')).length, 4);
  });

  test('Abos: im Cache, ein Ereignis leert den Server, ein beendetes zählt nicht', async () => {
    mock.kaeufe = [abo(ABO, ALLES, SERVER)];
    const f = baue();
    assert.equal(await f.frei(SERVER, 'strafen'), true);
    assert.equal(await f.frei(SERVER, 'log'), true);
    assert.equal(listen().filter((a) => a.pfad.includes('guild_id')).length, 1);
    const ende = Date.now() - 1000;
    const alt = kauf(ABO);
    if (alt) alt.ends_at = new Date(ende).toISOString();
    // Noch im Cache: Discord wird nicht gefragt.
    assert.equal(await f.frei(SERVER, 'strafen'), true);
    await f.ereignis('geaendert', { id: ABO, sku: ALLES, server: SERVER, verbraucht: false, geloescht: false, ende });
    assert.equal(await f.frei(SERVER, 'strafen'), false);
    assert.equal(listen().filter((a) => a.pfad.includes('guild_id')).length, 2);
  });

  test('ein Abo zählt bis zu seinem Ende, auch im Cache; nach der Zeit des Caches fragt der Bot neu', async () => {
    mock.kaeufe = [abo(ABO, LOG, SERVER, new Date(Date.now() + 150).toISOString())];
    const f = baue({ aboZeit: 1_000 });
    assert.equal(await f.frei(SERVER, 'log'), true);
    assert.equal(await f.frei(SERVER, 'strafen'), false);
    await warte(200);
    assert.equal(await f.frei(SERVER, 'log'), false);
    assert.equal(listen().filter((a) => a.pfad.includes('guild_id')).length, 1);
    const kurz = baue({ aboZeit: 30 });
    await kurz.frei(ANDERER, 'log');
    await warte(60);
    await kurz.frei(ANDERER, 'log');
    assert.equal(listen().filter((a) => a.pfad.includes(`guild_id=${ANDERER}`)).length, 2);
  });

  test('ohne SKU des Einmalkaufs schaltet „Alles“ trotzdem frei; binden geht nicht, der Link zeigt in den Store', async () => {
    mock.kaeufe = [abo(ABO, ALLES, SERVER)];
    const ohne = baue({ einmalkauf: new Map() });
    assert.equal(ohne.bindbar('strafen'), false);
    assert.equal(await ohne.frei(SERVER, 'strafen'), true);
    await assert.rejects(ohne.binde(SERVER, PERSON, 'strafen'), fehler('nicht_gefunden', 404));
    assert.equal(ohne.kaufen('strafen'), `https://discord.com/application-directory/${ANWENDUNG}/store`);
    assert.equal(baue().kaufen('strafen'), `https://discord.com/application-directory/${ANWENDUNG}/store/${SKU}`);
    assert.equal(baue({ abos: [] }).kaufen('log'), undefined);
  });

  test('ein gelöschter Kauf beendet seine Bindung', async () => {
    mock.kaeufe = [einmalkauf(KAUF_1, SKU, PERSON)];
    const f = baue({ abos: [] });
    await f.binde(SERVER, PERSON, 'strafen');
    assert.equal(await f.frei(SERVER, 'strafen'), true);
    await f.ereignis('geloescht', { id: KAUF_1, sku: SKU, server: null, verbraucht: true, geloescht: true, ende: null });
    assert.deepEqual(await gebunden(), []);
    assert.equal(await f.frei(SERVER, 'strafen'), false);
  });

  // Siehe docs/schnittstelle/module.md, „Kauf binden“.
  describe('Abgleich nach einer neuen Sitzung', () => {
    const KAUF_3 = '510000000000000003';
    const binde = (entitlement: string, server: string, verbraucht = true) =>
      db.query('INSERT INTO bindungen (entitlement, server, sku, verbraucht) VALUES ($1, $2, $3, $4)', [entitlement, server, SKU, verbraucht]);
    const geloescht = (id: string) => ({ ...einmalkauf(id, SKU, PERSON), consumed: true, deleted: true });
    const shard0 = { id: 0, anzahl: 1 };

    test('ein gelöschter Kauf entfernt die Bindung, ein nicht verbrauchter wird verbraucht, ein fehlender bleibt; das Log nennt nur Zahlen', async (t) => {
      const log = t.mock.method(console, 'log', () => {});
      mock.kaeufe = [geloescht(KAUF_1), einmalkauf(KAUF_2, SKU, PERSON)];
      await binde(KAUF_1, SERVER);
      await binde(KAUF_2, ANDERER, false);
      await binde(KAUF_3, DRITTER);
      const f = baue({ abos: [] });
      assert.equal(await f.frei(SERVER, 'strafen'), true);
      await f.gleicheAb(shard0);
      assert.deepEqual(
        (await gebunden()).map((z) => [z.entitlement, z.verbraucht]),
        [
          [KAUF_2, true],
          [KAUF_3, true],
        ],
      );
      assert.equal(kauf(KAUF_2)?.consumed, true);
      assert.equal(await f.frei(SERVER, 'strafen'), false);
      const q = new URLSearchParams(listen().at(-1)?.pfad.split('?')[1] ?? '');
      assert.equal(q.get('sku_ids'), SKU);
      assert.equal(q.get('exclude_deleted'), 'false');
      const zeilen = log.mock.calls.map((c) => String(c.arguments[0]));
      assert.deepEqual(zeilen, ['Käufe abgeglichen: 3 Bindungen, 1 gelöscht, 1 nachverbraucht, 1 offen.']);
    });

    test('über zwei Seiten; scheitert die zweite, gilt, was die erste belegt, und der Rest bleibt', async (t) => {
      t.mock.method(console, 'log', () => {});
      t.mock.method(console, 'error', () => {});
      const fremde = Array.from({ length: 99 }, (_, i) => einmalkauf(String(510000000000000100n + BigInt(i)), SKU, '200000000000000099'));
      // KAUF_1 auf Seite 1, der zweite gelöschte Kauf auf Seite 2.
      const spaet = '510000000000009999';
      mock.kaeufe = [geloescht(KAUF_1), ...fremde, geloescht(spaet)];
      await binde(KAUF_1, SERVER);
      await binde(spaet, ANDERER);
      mock.kaeufeFolge = ['ok', 502];
      await baue({ abos: [] }).gleicheAb(shard0);
      assert.deepEqual((await gebunden()).map((z) => z.entitlement), [spaet]);
      // Klappt die zweite Seite, fällt auch die zweite Bindung.
      await baue({ abos: [] }).gleicheAb(shard0);
      assert.deepEqual(await gebunden(), []);
      const seiten = listen().filter((a) => a.pfad.includes('exclude_deleted=false'));
      assert.equal(seiten.length, 4);
      assert.equal(new URLSearchParams(seiten[1]?.pfad.split('?')[1] ?? '').get('after'), String(510000000000000198n));
    });

    test('bei 5xx und Abbruch bleiben alle Bindungen; bei 429 wartet der Bot und gleicht danach ab', async (t) => {
      t.mock.method(console, 'log', () => {});
      t.mock.method(console, 'error', () => {});
      mock.kaeufe = [geloescht(KAUF_1)];
      await binde(KAUF_1, SERVER);
      const f = baue({ abos: [] });
      mock.kaeufeFolge = [503];
      await f.gleicheAb(shard0);
      mock.kaeufeFolge = ['abbruch'];
      await f.gleicheAb(shard0);
      assert.equal((await gebunden()).length, 1);
      mock.kaeufeWarten = [0];
      await f.gleicheAb(shard0);
      assert.deepEqual(await gebunden(), []);
    });

    test('nur die Server des eigenen Shards', async (t) => {
      t.mock.method(console, 'log', () => {});
      mock.kaeufe = [geloescht(KAUF_1), geloescht(KAUF_3)];
      await binde(KAUF_1, SERVER);
      await binde(KAUF_3, DRITTER);
      const f = baue({ abos: [] });
      await f.gleicheAb({ id: 0, anzahl: 2 });
      assert.deepEqual((await gebunden()).map((z) => z.server), [DRITTER]);
      await f.gleicheAb({ id: 1, anzahl: 2 });
      assert.deepEqual(await gebunden(), []);
    });
  });
});
