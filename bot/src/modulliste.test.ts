import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';
import { Aufraeumen } from './kern/aufraeumen.js';
import { migriere, oeffne, verbindung } from './kern/datenbank.js';
import { Zaehlung } from './kern/zaehlung.js';
import { alleModule } from './modulliste.js';

// Die Liste der Module gegen die Datenbank nach allen Migrationen.
// Siehe docs/entwicklung/struktur.md, „Ein Modul“.
const ziel = verbindung();

describe('Module', { skip: ziel ? false : 'keine Datenbank, DB_HOST fehlt' }, () => {
  let db: Pool;

  before(async () => {
    if (!ziel) return;
    await migriere(ziel, fileURLToPath(new URL('../migrationen', import.meta.url)));
    db = oeffne(ziel);
  });

  after(async () => {
    if (!ziel) return;
    await db.end();
  });

  test('jede Tabelle mit Daten je Server (Spalte server bigint) gehört genau einem Modul', async () => {
    const { rows } = await db.query<{ tabelle: string }>(
      `SELECT table_name AS tabelle FROM information_schema.columns
       WHERE table_schema = current_schema() AND column_name = 'server' AND data_type = 'bigint'`,
    );
    const inDerDatenbank = rows.map((z) => z.tabelle).toSorted();
    // Aufraeumen wirft, wenn eine Tabelle zwei Modulen gehört.
    const aufraeumer = new Aufraeumen(alleModule({ db, zaehlung: new Zaehlung(), kanal: () => undefined }));
    assert.deepEqual([...aufraeumer.tabellen].toSorted(), inDerDatenbank);
    assert.ok(inDerDatenbank.length > 0);
  });

  test('die Seiten kommen in der Reihenfolge der Tabs; vergiss leert den Cache jedes Moduls nur für seinen Server', () => {
    // Caches, die sich merken, was sie vergessen.
    const vergessen: Record<'einstellungen' | 'sprachraeume', string[]> = { einstellungen: [], sprachraeume: [] };
    const cache = (name: keyof typeof vergessen) => ({ fetch: async () => undefined, delete: (server: string) => vergessen[name].push(server) });
    const liste = alleModule({ db, zaehlung: new Zaehlung(), kanal: () => undefined, einstellungen: cache('einstellungen'), sprachraeume: cache('sprachraeume') });
    assert.deepEqual(
      liste.flatMap((m) => (m.bereich ? Object.keys(m.bereich.seiten) : [])),
      ['beitritt', 'abschied', 'sprachraeume'],
    );
    for (const m of liste) m.vergiss?.('300000000000000071');
    assert.deepEqual(vergessen, { einstellungen: ['300000000000000071'], sprachraeume: ['300000000000000071'] });
  });

  test('welches Modul welche Ereignisse, Befehle und Knöpfe hat', () => {
    const liste = alleModule({ db, zaehlung: new Zaehlung(), kanal: () => undefined });
    assert.deepEqual(
      liste.map((m) => ({
        name: m.name,
        ereignisse: Object.keys(m.ereignisse ?? {}),
        befehle: (m.befehle ?? []).map((b) => b.name),
        praefix: m.knoepfe?.praefix,
      })),
      [
        { name: 'befehle', ereignisse: [], befehle: ['ping'], praefix: undefined },
        { name: 'begruessung', ereignisse: ['beitritt', 'abschied'], befehle: [], praefix: undefined },
        { name: 'sprachraeume', ereignisse: ['bereit', 'stimme', 'kanalWeg'], befehle: [], praefix: 'sprachraum:' },
      ],
    );
  });
});
