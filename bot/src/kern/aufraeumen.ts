import type { Pool } from 'pg';
import type { Modul } from './modul.js';

// Ein Name, der ohne Anführungszeichen ins SQL darf.
const tabellenName = /^[a-z_][a-z0-9_]{0,62}$/;

// Die Shards eines Prozesses, den der ShardingManager gestartet hat.
export interface Shards {
  ids: number[];
  count: number;
}

// SQL: Gehört die Spalte `server` zu einem der Shards in `ids` bei `anzahl`
// Shards? Ist `anzahl` NULL, gehört jeder Server dazu. `anzahl` und `ids`
// sind Parameter, etwa `$2` und `$3`. Der Shard eines Servers ist
// (ID >> 22) % Anzahl, siehe docs/bot/dashboard-api.md, „Aufräumen“.
export function aufShards(anzahl: string, ids: string): string {
  return `(${anzahl}::int IS NULL OR (server >> 22) % ${anzahl} = ANY(${ids}::int[]))`;
}

// Löscht die Daten je Server aus den Tabellen aller Module, jedes Mal in
// einer Anweisung und damit in einer Transaktion. Die Namen der Tabellen
// prüft es beim Bauen, bevor sie ins SQL kommen; jede gehört genau einem
// Modul. Siehe docs/bot/dashboard-api.md, „Aufräumen“.
export class Aufraeumen {
  readonly tabellen: readonly string[];

  constructor(module: readonly Pick<Modul<unknown>, 'name' | 'tabellen'>[]) {
    const tabellen: string[] = [];
    for (const { name, tabellen: eigene = [] } of module) {
      for (const tabelle of eigene) {
        if (!tabellenName.test(tabelle)) throw new Error(`Modul ${name}: ${tabelle} taugt nicht als Tabelle.`);
        if (tabellen.includes(tabelle)) throw new Error(`Modul ${name}: ${tabelle} gehört schon einem anderen Modul.`);
        tabellen.push(tabelle);
      }
    }
    this.tabellen = tabellen;
  }

  // Löscht alles zu einem Server, den der Bot verlassen hat. Die Räume bei
  // Discord bleiben stehen; der Bot hat dort keine Rechte mehr.
  async vergiss(db: Pick<Pool, 'query'>, server: string): Promise<void> {
    if (this.tabellen.length === 0) return;
    const weg = this.tabellen.map((t) => `${t}_weg AS (DELETE FROM ${t} WHERE server = $1)`).join(', ');
    await db.query(`WITH ${weg} SELECT 1`, [server]);
  }

  // Löscht beim Start alles zu Servern, die nicht in `server` stehen, und
  // gibt die Zahl dieser Server zurück. Mit `shards` nur unter den Servern
  // dieser Shards; die anderen sieht der Prozess nicht.
  async behalteNur(db: Pick<Pool, 'query'>, server: string[], shards?: Shards): Promise<number> {
    if (this.tabellen.length === 0) return 0;
    const fremd = `NOT (server = ANY($1)) AND ${aufShards('$2', '$3')}`;
    const weg = this.tabellen.map((t) => `${t}_weg AS (DELETE FROM ${t} WHERE ${fremd} RETURNING server)`).join(', ');
    const alle = this.tabellen.map((t) => `SELECT server FROM ${t}_weg`).join(' UNION ALL ');
    const { rows } = await db.query<{ zahl: number }>(
      `WITH ${weg} SELECT count(DISTINCT server)::int AS zahl FROM (${alle}) AS weg`,
      [server, shards?.count ?? null, shards?.ids ?? []],
    );
    return rows[0]?.zahl ?? 0;
  }
}
