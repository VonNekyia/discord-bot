import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';
import { BausteinFehler } from '../kern/baukasten.js';
import { migriere, oeffne, verbindung } from '../kern/datenbank.js';
import type { Kontext } from '../discord/kontext.js';
import { Brett, liesSchalter, type BrettModul } from './brett.js';

// Das Board gegen eine echte PostgreSQL; ohne DB_HOST übersprungen. Alle IDs
// sind erfunden. Siehe docs/schnittstelle/module.md.
const ziel = verbindung();
const SERVER = '300000000000000091';
const ANDERER = '300000000000000092';
const LADEN = 'https://discord.com/application-directory/100000000000000001/store/400000000000000001';

const module: BrettModul[] = [
  { name: 'befehle' },
  { name: 'frei', schalter: { titel: 'Frei', hilfe: 'Kostet nichts.' } },
  { name: 'teuer', schalter: { titel: 'Teuer', hilfe: 'Kostet etwas.', bezahlt: true } },
];
const k = (server: string) => ({ server: { id: server, name: 'Probe' } }) as unknown as Kontext;

describe('Board', { skip: ziel ? false : 'keine Datenbank, DB_HOST fehlt' }, () => {
  let db: Pool;
  // Welche Server das bezahlte Modul freigeschaltet haben.
  const frei = new Set<string>();
  let brett: Brett;

  before(async () => {
    if (!ziel) return;
    await migriere(ziel, fileURLToPath(new URL('../../migrationen', import.meta.url)));
    db = oeffne(ziel);
    await db.query('DELETE FROM module_an WHERE server = ANY($1)', [[SERVER, ANDERER]]);
    brett = new Brett({ db, module, freigeschaltet: async (server) => frei.has(server), kaufen: (m) => (m === 'teuer' ? LADEN : undefined) });
  });

  after(async () => {
    if (!ziel) return;
    await db.query('DELETE FROM module_an WHERE server = ANY($1)', [[SERVER, ANDERER]]);
    await db.end();
  });

  test('ohne gespeicherten Stand: frei an, bezahlt aus; ohne Schalter immer an', async () => {
    assert.equal(await brett.istAn('befehle', SERVER), true);
    assert.equal(await brett.istAn('frei', SERVER), true);
    assert.equal(await brett.istAn('teuer', SERVER), false);
    // Ein Name, den das Board nicht kennt, hat keinen Schalter.
    assert.equal(await brett.istAn('unbekannt', SERVER), true);
  });

  test('die Seite: Hinweis, je Modul mit Schalter einer, nicht freigeschaltet gesperrt mit Link; alleNeu', async () => {
    const [seite, ...mehr] = await brett.bereich.zeige(k(SERVER));
    assert.equal(mehr.length, 0);
    assert.ok(seite);
    assert.equal(seite.id, 'module');
    assert.equal(seite.titel, 'Module');
    assert.equal(seite.alleNeu, true);
    assert.deepEqual(seite.wert, { frei: true, teuer: false });
    assert.deepEqual(
      seite.bausteine.map((b) => [b.art, b.id]),
      [
        ['hinweis', 'hinweis'],
        ['schalter', 'frei'],
        ['schalter', 'teuer'],
        ['link', 'teuerKaufen'],
      ],
    );
    const teuer = seite.bausteine.find((b) => b.id === 'teuer');
    assert.ok(teuer?.art === 'schalter');
    assert.equal(teuer.gesperrt?.code, 'nicht_freigeschaltet');
    assert.ok(seite.saetze.nicht_freigeschaltet);
    const link = seite.bausteine.find((b) => b.id === 'teuerKaufen');
    assert.ok(link?.art === 'link' && link.url.startsWith('https://discord.com/'));
    assert.ok(!seite.bausteine.some((b) => b.id === 'befehle'));
  });

  test('speichern schaltet um und gilt sofort; ungültig nennt das Feld', async () => {
    const antwort = await brett.bereich.speichere(k(SERVER), 'module', { frei: false });
    assert.deepEqual(antwort.wert, { frei: false, teuer: false });
    assert.deepEqual(antwort.meldung, { titel: 'Gespeichert.', text: '0 von 2 Modulen sind an.' });
    assert.equal(await brett.istAn('frei', SERVER), false);
    // Ein anderer Server bleibt, wie er war.
    assert.equal(await brett.istAn('frei', ANDERER), true);

    await assert.rejects(brett.bereich.speichere(k(SERVER), 'module', { frei: 'ja' }), (e: unknown) => e instanceof BausteinFehler && e.status === 400 && e.code === 'ungueltig' && e.feld === 'frei');
    await assert.rejects(brett.bereich.speichere(k(SERVER), 'module', []), (e: unknown) => e instanceof BausteinFehler && e.code === 'ungueltig' && e.feld === 'frei');
    await assert.rejects(brett.bereich.speichere(k(SERVER), 'module', {}), (e: unknown) => e instanceof BausteinFehler && e.feld === 'frei');
    await assert.rejects(brett.bereich.speichere(k(SERVER), 'andere', {}), (e: unknown) => e instanceof BausteinFehler && e.status === 404);

    await brett.bereich.speichere(k(SERVER), 'module', { frei: true, fremd: 1 });
    assert.equal(await brett.istAn('frei', SERVER), true);
  });

  // Siehe docs/schnittstelle/module.md, „Schalter ohne Freischaltung“.
  test('nicht freigeschaltet behält das Board den gespeicherten Schalter, egal was kommt; freigeschaltet gilt er wieder', async () => {
    frei.add(SERVER);
    await brett.bereich.speichere(k(SERVER), 'module', { frei: true, teuer: true });
    assert.equal(await brett.istAn('teuer', SERVER), true);
    const [seite] = await brett.bereich.zeige(k(SERVER));
    assert.ok(!seite?.bausteine.some((b) => b.art === 'link'));
    assert.ok(!seite?.bausteine.some((b) => b.art === 'schalter' && b.gesperrt));

    // Die Freischaltung endet: aus, gesperrt, und Speichern ändert nichts daran.
    frei.delete(SERVER);
    assert.equal(await brett.istAn('teuer', SERVER), false);
    assert.deepEqual((await brett.bereich.speichere(k(SERVER), 'module', { frei: true, teuer: false })).wert, { frei: true, teuer: false });
    await brett.bereich.speichere(k(SERVER), 'module', { frei: true });
    assert.equal((await liesSchalter(db, SERVER)).get('teuer'), true);

    // Sie kommt wieder: ohne neues Speichern an.
    frei.add(SERVER);
    assert.equal(await brett.istAn('teuer', SERVER), true);
    frei.delete(SERVER);
  });

  // Siehe docs/schnittstelle/module.md, „Kauf binden“.
  test('Kauf binden: die Aktion steht nur, solange das Modul gesperrt ist; loeseAus bindet für die angemeldete Person', async () => {
    const gebunden: [string, string, string][] = [];
    const mitBinden = new Brett({
      db,
      module,
      freigeschaltet: async (server) => frei.has(server),
      kaufen: () => LADEN,
      bindbar: (m) => m === 'teuer',
      binde: async (server, nutzer, modul) => {
        gebunden.push([server, nutzer, modul]);
      },
    });
    assert.deepEqual(mitBinden.bereich.seiten, { module: { teuerBinden: 'aktion' } });
    assert.deepEqual(brett.bereich.seiten, { module: {} });
    const [seite] = await mitBinden.bereich.zeige(k(ANDERER));
    assert.deepEqual(seite?.bausteine.map((b) => b.id), ['hinweis', 'frei', 'teuer', 'teuerKaufen', 'teuerBinden']);
    assert.ok(seite.saetze.kein_kauf && seite.saetze.schon_freigeschaltet);

    const loeseAus = mitBinden.bereich.loeseAus?.bind(mitBinden.bereich);
    assert.ok(loeseAus);
    const person = { server: { id: ANDERER, name: 'Probe' }, mitglied: { id: '200000000000000002' } } as unknown as Kontext;
    assert.deepEqual(await loeseAus(person, 'module', 'teuerBinden'), { titel: 'Teuer ist freigeschaltet.', text: 'Schalte es hier an, damit es auf dem Server läuft.' });
    assert.deepEqual(gebunden, [[ANDERER, '200000000000000002', 'teuer']]);
    await assert.rejects(loeseAus(person, 'module', 'freiBinden'), (e: unknown) => e instanceof BausteinFehler && e.status === 404);

    // Freigeschaltet: keine Aktion mehr.
    frei.add(ANDERER);
    const [danach] = await mitBinden.bereich.zeige(k(ANDERER));
    assert.ok(!danach?.bausteine.some((b) => b.art === 'aktion'));
    frei.delete(ANDERER);
  });

  test('der Cache: Speichern und vergiss lesen neu, sonst nicht', async () => {
    const gelesen: string[] = [];
    const zaehlend = new Brett({
      db: {
        query: (async (sql: string, werte: unknown[]) => {
          gelesen.push(sql);
          return db.query(sql, werte);
        }) as unknown as Pool['query'],
      },
      module,
    });
    await zaehlend.istAn('frei', ANDERER);
    await zaehlend.istAn('frei', ANDERER);
    assert.equal(gelesen.length, 1);
    zaehlend.vergiss(ANDERER);
    await zaehlend.istAn('frei', ANDERER);
    assert.equal(gelesen.length, 2);
  });
});
