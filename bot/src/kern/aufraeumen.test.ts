import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Aufraeumen } from './aufraeumen.js';

// Aufräumen ohne Datenbank: eine Fälschung, die nur die Anfragen sammelt.
// Mit PostgreSQL prüfen es bot/src/api/server.test.ts und bot/src/modulliste.test.ts.
function datenbank() {
  const anfragen: { sql: string; werte: unknown[] }[] = [];
  return {
    anfragen,
    db: {
      query: async (sql: string, werte: unknown[]) => {
        anfragen.push({ sql, werte });
        return { rows: [{ zahl: 0 }] };
      },
    } as never,
  };
}

test('Aufraeumen prüft die Tabellen beim Bauen: nur Namen fürs SQL, jede in genau einem Modul', () => {
  assert.throws(() => new Aufraeumen([{ name: 'a', tabellen: ['gut', 'Böse'] }]), /Modul a: Böse taugt nicht als Tabelle/);
  assert.throws(() => new Aufraeumen([{ name: 'a', tabellen: ['x; DROP TABLE y'] }]), /taugt nicht als Tabelle/);
  assert.throws(() => new Aufraeumen([{ name: 'a', tabellen: ['eins'] }, { name: 'b', tabellen: ['zwei', 'eins'] }]), /Modul b: eins gehört schon einem anderen Modul/);
  assert.deepEqual(new Aufraeumen([{ name: 'a', tabellen: ['eins'] }, { name: 'b' }, { name: 'c', tabellen: ['zwei', 'drei_4'] }]).tabellen, ['eins', 'zwei', 'drei_4']);
});

test('vergiss und behalteNur löschen in einer Anweisung aus jeder Tabelle; ohne Tabellen fragen sie nicht', async () => {
  const { db, anfragen } = datenbank();
  const aufraeumer = new Aufraeumen([{ name: 'a', tabellen: ['eins'] }, { name: 'b', tabellen: ['zwei'] }]);
  await aufraeumer.vergiss(db, '300000000000000061');
  await aufraeumer.behalteNur(db, ['300000000000000062'], { ids: [1], count: 2 });
  assert.equal(anfragen.length, 2);
  for (const { sql } of anfragen) {
    assert.equal(sql.match(/DELETE FROM eins /g)?.length, 1, sql);
    assert.equal(sql.match(/DELETE FROM zwei /g)?.length, 1, sql);
  }
  assert.deepEqual(anfragen.map((a) => a.werte), [['300000000000000061'], [['300000000000000062'], 2, [1]]]);

  const leer = new Aufraeumen([{ name: 'a' }]);
  await leer.vergiss(db, '300000000000000061');
  assert.equal(await leer.behalteNur(db, []), 0);
  assert.equal(anfragen.length, 2);
});
