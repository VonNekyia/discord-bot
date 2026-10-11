import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Client, Pool, type ClientConfig } from 'pg';

// Wohin der Bot sich verbindet, aus der Umgebung; undefined, wenn etwas fehlt.
// Siehe docs/bot/datenbank.md, „Verbindung“.
export function verbindung(umgebung = process.env): ClientConfig | undefined {
  const { DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD } = umgebung;
  if (!DB_HOST || !DB_NAME || !DB_USER || !DB_PASSWORD) return undefined;
  return {
    host: DB_HOST,
    port: Number(DB_PORT ?? 5432),
    database: DB_NAME,
    user: DB_USER,
    password: DB_PASSWORD,
    // Jede Sitzung spricht UTF-8 und rechnet in UTC.
    options: '-c client_encoding=UTF8 -c TimeZone=UTC',
    connectionTimeoutMillis: 10_000,
  };
}

// Ein Pool für den ganzen Bot. Siehe docs/bot/datenbank.md, „Pool“.
export function oeffne(ziel: ClientConfig): Pool {
  const pool = new Pool({
    ...ziel,
    max: 5,
    min: 2,
    idleTimeoutMillis: 60_000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
  });
  // Trennt die Datenbank eine freie Verbindung, wirft der Pool sie weg und
  // meldet es hier. Ohne Zuhörer endete der Prozess.
  pool.on('error', (fehler) => console.error(`Datenbank: ${fehler.message}`));
  return pool;
}

// Schlüssel der Sperre, unter der migriert wird: „kitty“ in ASCII.
const sperre = 0x6b69747479;

// Wendet jede .sql-Datei in `ordner` genau einmal an, nach Namen sortiert, und
// gibt die neuen zurück. Jede Datei läuft mit ihrem Eintrag in einer eigenen
// Transaktion, alles unter einer Sperre für die Datenbank.
// Siehe docs/bot/datenbank.md, „Migrationen“.
export async function migriere(ziel: ClientConfig, ordner: string): Promise<string[]> {
  const client = new Client(ziel);
  // Bricht die Verbindung ab, scheitert die nächste Anfrage. Ohne Zuhörer endete der Prozess.
  client.on('error', () => {});
  await client.connect();
  try {
    // Die Sperre gilt für die Sitzung; `end` gibt sie frei.
    await client.query('SELECT pg_advisory_lock($1)', [sperre]);
    await client.query(
      'CREATE TABLE IF NOT EXISTS migrationen (name text PRIMARY KEY, angewendet timestamptz NOT NULL DEFAULT now())',
    );
    const { rows } = await client.query<{ name: string }>('SELECT name FROM migrationen');
    const fertig = new Set(rows.map((zeile) => zeile.name));
    const neu = (await readdir(ordner)).filter((name) => name.endsWith('.sql') && !fertig.has(name)).sort();
    for (const name of neu) {
      const sql = await readFile(join(ordner, name), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO migrationen (name) VALUES ($1)', [name]);
        await client.query('COMMIT');
      } catch (fehler) {
        await client.query('ROLLBACK').catch(() => {});
        throw fehler;
      }
    }
    return neu;
  } finally {
    await client.end();
  }
}

// Wie lange eine Anfrage an die Datenbank hin und zurück braucht, in ms;
// wirft nach `frist` ms. Siehe docs/benutzung/befehle.md, „Antwortzeit“.
export async function misse(db: Pick<Pool, 'query'>, frist = 2_000): Promise<number> {
  const start = performance.now();
  let uhr: NodeJS.Timeout | undefined;
  const abgelaufen = new Promise<never>((_, nein) => {
    uhr = setTimeout(() => nein(new Error(`keine Antwort nach ${frist} ms`)), frist);
  });
  try {
    await Promise.race([db.query('SELECT 1'), abgelaufen]);
  } finally {
    clearTimeout(uhr);
  }
  return Math.round(performance.now() - start);
}
