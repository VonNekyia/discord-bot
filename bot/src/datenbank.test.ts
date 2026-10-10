import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { RowDataPacket } from 'mysql2/promise';
import { migriere, misse, oeffne, verbindung } from './datenbank.js';

// Gegen eine echte MariaDB; ohne DB_HOST übersprungen, in der CI immer dabei.
// Siehe docs/entwicklung/tests.md, „Tests gegen MariaDB“.
const ziel = verbindung();
if (!ziel && process.env.CI) throw new Error('In der CI muss die Datenbank da sein: DB_* fehlt.');
const ohne = ziel ? false : 'keine Datenbank, DB_HOST fehlt';

test('verbindung braucht Host, Name, Nutzer und Passwort', () => {
  assert.equal(verbindung({ DB_HOST: 'h', DB_NAME: 'n', DB_USER: 'u' }), undefined);
  assert.equal(verbindung({ DB_HOST: 'h', DB_NAME: 'n', DB_USER: 'u', DB_PASSWORD: 'p' })?.port, 3306);
});

test('migriere wendet jede Datei genau einmal an, Discord-IDs bleiben genau', { skip: ohne }, async (t) => {
  if (!ziel) return;
  const ordner = await mkdtemp(join(tmpdir(), 'migrationen-'));
  const db = oeffne(ziel);
  t.after(async () => {
    await db.query('DROP TABLE IF EXISTS probe');
    await db.query("DELETE FROM migrationen WHERE name LIKE 'probe-%'");
    await db.end();
    await rm(ordner, { recursive: true });
  });
  await writeFile(join(ordner, 'probe-2.sql'), 'INSERT INTO probe VALUES (18446744073709551615);');
  await writeFile(join(ordner, 'probe-1.sql'), 'CREATE TABLE probe (id BIGINT UNSIGNED PRIMARY KEY);\nINSERT INTO probe VALUES (1);');
  await writeFile(join(ordner, 'liesmich.txt'), 'keine Migration');

  assert.deepEqual(await migriere(ziel, ordner), ['probe-1.sql', 'probe-2.sql']);
  assert.deepEqual(await migriere(ziel, ordner), []);
  const [zeilen] = await db.query<RowDataPacket[]>('SELECT id FROM probe ORDER BY id');
  assert.deepEqual(zeilen.map((z) => z.id), ['1', '18446744073709551615']);
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
