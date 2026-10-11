import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { Client, type ClientConfig } from 'pg';
import { migriere, misse, oeffne, verbindung } from './datenbank.js';

// Gegen eine echte PostgreSQL; ohne DB_HOST übersprungen, in der CI immer dabei.
// Siehe docs/entwicklung/tests.md, „Tests gegen PostgreSQL“.
const ziel = verbindung();
if (!ziel && process.env.CI) throw new Error('In der CI muss die Datenbank da sein: DB_* fehlt.');
const ohne = ziel ? false : 'keine Datenbank, DB_HOST fehlt';

// Ein Ordner mit den Migrationen in `dateien` und ein Pool. Danach fallen die
// `tabellen` und die Einträge `probe-…` in `migrationen` weg.
async function probe(t: TestContext, ziel: ClientConfig, tabellen: string[], dateien: Record<string, string>) {
  const ordner = await mkdtemp(join(tmpdir(), 'migrationen-'));
  for (const [name, sql] of Object.entries(dateien)) await writeFile(join(ordner, name), sql);
  const db = oeffne(ziel);
  t.after(async () => {
    for (const tabelle of tabellen) await db.query(`DROP TABLE IF EXISTS ${tabelle}`);
    await db.query("DELETE FROM migrationen WHERE name LIKE 'probe-%'");
    await db.end();
    await rm(ordner, { recursive: true });
  });
  return { ordner, db };
}

test('verbindung braucht Host, Name, Nutzer und Passwort', () => {
  assert.equal(verbindung({ DB_HOST: 'h', DB_NAME: 'n', DB_USER: 'u' }), undefined);
  assert.equal(verbindung({ DB_HOST: 'h', DB_NAME: 'n', DB_USER: 'u', DB_PASSWORD: 'p' })?.port, 5432);
});

test('migriere wendet jede Datei genau einmal an, Discord-IDs bleiben genau', { skip: ohne }, async (t) => {
  if (!ziel) return;
  const { ordner, db } = await probe(t, ziel, ['probe'], {
    'probe-2.sql': 'INSERT INTO probe VALUES (9223372036854775807);',
    'probe-1.sql': 'CREATE TABLE probe (id bigint PRIMARY KEY);\nINSERT INTO probe VALUES (1);',
    'liesmich.txt': 'keine Migration',
  });

  assert.deepEqual(await migriere(ziel, ordner), ['probe-1.sql', 'probe-2.sql']);
  assert.deepEqual(await migriere(ziel, ordner), []);
  const { rows } = await db.query<{ id: string }>('SELECT id FROM probe ORDER BY id');
  assert.deepEqual(rows.map((z) => z.id), ['1', '9223372036854775807']);
});

// Ohne die Transaktion je Datei schrieben Datei und Eintrag zwei Transaktionen,
// und `xmin` unterschiede sich.
test('eine Migration gilt ganz oder gar nicht, mit ihrem Eintrag in einer Transaktion', { skip: ohne }, async (t) => {
  if (!ziel) return;
  const { ordner, db } = await probe(t, ziel, ['probe', 'probe_halb'], {
    'probe-1.sql': 'CREATE TABLE probe (id bigint PRIMARY KEY);\nINSERT INTO probe VALUES (1);',
    'probe-2.sql': 'CREATE TABLE probe_halb (id bigint);\nSELECT 1 / 0;',
  });

  await assert.rejects(migriere(ziel, ordner), /division by zero/);
  const { rows } = await db.query<{ datei: string | null; eintrag: string | null; halb: string | null }>(
    `SELECT (SELECT xmin::text FROM probe WHERE id = 1) AS datei,
            (SELECT xmin::text FROM migrationen WHERE name = 'probe-1.sql') AS eintrag,
            to_regclass('probe_halb')::text AS halb`,
  );
  assert.ok(rows[0]?.datei);
  assert.equal(rows[0]?.eintrag, rows[0]?.datei);
  assert.equal(rows[0]?.halb, null);

  await writeFile(join(ordner, 'probe-2.sql'), 'CREATE TABLE probe_halb (id bigint);');
  assert.deepEqual(await migriere(ziel, ordner), ['probe-2.sql']);
});

// Die erste Datei schläft 0,5 s. Ohne die Sperre lesen beide Läufe in der Zeit
// dieselbe leere Liste, und der zweite scheitert an CREATE TABLE.
test('zwei gleichzeitige Läufe von migriere wenden jede Datei nur einmal an', { skip: ohne }, async (t) => {
  if (!ziel) return;
  const { ordner } = await probe(t, ziel, ['probe'], {
    'probe-1.sql': 'SELECT pg_sleep(0.5);\nCREATE TABLE probe (id bigint PRIMARY KEY);',
    'probe-2.sql': 'INSERT INTO probe VALUES (1);',
  });

  const laeufe = await Promise.all([migriere(ziel, ordner), migriere(ziel, ordner)]);
  assert.deepEqual(laeufe.sort((a, b) => b.length - a.length), [['probe-1.sql', 'probe-2.sql'], []]);
});

test('der Pool überlebt, wenn die Datenbank eine freie Verbindung trennt', { skip: ohne }, async (t) => {
  if (!ziel) return;
  const db = oeffne(ziel);
  const andere = new Client(ziel);
  await andere.connect();
  t.after(async () => {
    await andere.end();
    await db.end();
  });
  const log = t.mock.method(console, 'error', () => {});

  const { rows } = await db.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
  const gemeldet = once(db, 'error');
  await andere.query('SELECT pg_terminate_backend($1)', [rows[0]?.pid]);
  await gemeldet;
  assert.equal(log.mock.callCount(), 1);
  assert.match(String(log.mock.calls[0]?.arguments[0]), /^Datenbank: /);
  assert.equal((await db.query<{ eins: number }>('SELECT 1 AS eins')).rows[0]?.eins, 1);
});

test('misse misst eine Anfrage an die Datenbank', { skip: ohne }, async () => {
  if (!ziel) return;
  const db = oeffne(ziel);
  try {
    assert.ok((await misse(db)) >= 0);
  } finally {
    await db.end();
  }
});
