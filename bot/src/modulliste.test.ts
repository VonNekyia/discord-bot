import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';
import { Brett } from './brett/brett.js';
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

  test('jede Tabelle mit Daten je Server (Spalte server bigint) gehört genau einem Modul oder dem Board, ausser bindungen', async () => {
    const { rows } = await db.query<{ tabelle: string }>(
      `SELECT table_name AS tabelle FROM information_schema.columns
       WHERE table_schema = current_schema() AND column_name = 'server' AND data_type = 'bigint'`,
    );
    const inDerDatenbank = rows.map((z) => z.tabelle).toSorted();
    // Aufraeumen wirft, wenn eine Tabelle zwei Modulen gehört. Wie in bot/src/index.ts mit dem Board.
    const module = alleModule({ db, zaehlung: new Zaehlung(), kanal: () => undefined });
    const aufraeumer = new Aufraeumen([...module, new Brett({ db, module })]);
    // Bleibt, wenn der Bot einen Server verlässt, sonst ginge ein Kauf
    // verloren. Siehe docs/entscheidungen/0020-bezahlte-module.md, „Entscheidung“.
    const bleiben = ['bindungen'];
    assert.deepEqual([...aufraeumer.tabellen, ...bleiben].toSorted(), inDerDatenbank);
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

  test('welches Modul welche Ereignisse, Befehle, Knöpfe und welchen Schalter hat', () => {
    const liste = alleModule({ db, zaehlung: new Zaehlung(), kanal: () => undefined });
    assert.deepEqual(
      liste.map((m) => ({
        name: m.name,
        ereignisse: Object.keys(m.ereignisse ?? {}),
        aufraeumen: Object.keys(m.aufraeumen ?? {}),
        befehle: (m.befehle ?? []).map((b) => b.name),
        praefix: m.knoepfe?.praefix,
        schalter: m.schalter ? { bezahlt: m.schalter.bezahlt ?? false } : undefined,
      })),
      [
        { name: 'befehle', ereignisse: [], aufraeumen: [], befehle: ['ping'], praefix: undefined, schalter: undefined },
        { name: 'begruessung', ereignisse: ['beitritt', 'abschied'], aufraeumen: [], befehle: [], praefix: undefined, schalter: { bezahlt: false } },
        { name: 'sprachraeume', ereignisse: ['stimme'], aufraeumen: ['bereit', 'stimme', 'kanalWeg'], befehle: [], praefix: 'sprachraum:', schalter: { bezahlt: false } },
      ],
    );
  });
});
