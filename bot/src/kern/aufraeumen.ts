import type { Pool } from 'pg';

// Tabellen mit Daten je Server: Begrüssung, Bilder, Sprachräume und Räume.
// Verlässt der Bot einen Server, gehen ihre Zeilen.
// Siehe docs/benutzung/begruessung.md, „Wenn etwas fehlt“, und
// docs/benutzung/sprachraeume.md, „Wenn etwas fehlt“.
const tabellen = ['bilder', 'begruessungen', 'sprachraeume', 'raeume'] as const;

// Löscht alles zu einem Server, den der Bot verlassen hat. Die Räume bei
// Discord bleiben stehen; der Bot hat dort keine Rechte mehr.
export async function vergiss(db: Pick<Pool, 'query'>, server: string): Promise<void> {
  const weg = tabellen.map((t) => `${t}_weg AS (DELETE FROM ${t} WHERE server = $1)`).join(', ');
  await db.query(`WITH ${weg} SELECT 1`, [server]);
}

// Die Shards eines Prozesses, den der ShardingManager gestartet hat.
export interface Shards {
  ids: number[];
  count: number;
}

// Löscht beim Start alles zu Servern, die nicht in `server` stehen, und gibt
// die Zahl dieser Server zurück. Mit `shards` nur unter den Servern dieser
// Shards; die anderen sieht der Prozess nicht.
// Siehe docs/bot/dashboard-api.md, „Aufräumen“.
export async function behalteNur(db: Pick<Pool, 'query'>, server: string[], shards?: Shards): Promise<number> {
  const fremd = `NOT (server = ANY($1)) AND ($2::int IS NULL OR (server >> 22) % $2 = ANY($3::int[]))`;
  const weg = tabellen.map((t) => `${t}_weg AS (DELETE FROM ${t} WHERE ${fremd} RETURNING server)`).join(', ');
  const alle = tabellen.map((t) => `SELECT server FROM ${t}_weg`).join(' UNION ALL ');
  const { rows } = await db.query<{ zahl: number }>(
    `WITH ${weg} SELECT count(DISTINCT server)::int AS zahl FROM (${alle}) AS weg`,
    [server, shards?.count ?? null, shards?.ids ?? []],
  );
  return rows[0]?.zahl ?? 0;
}
