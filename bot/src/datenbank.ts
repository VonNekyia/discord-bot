import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import mysql, { type ConnectionOptions, type Pool, type RowDataPacket } from 'mysql2/promise';

// Wohin der Bot sich verbindet, aus der Umgebung; undefined, wenn etwas fehlt.
// Siehe docs/bot/datenbank.md, „Verbindung“.
export function verbindung(umgebung = process.env): ConnectionOptions | undefined {
  const { DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD } = umgebung;
  if (!DB_HOST || !DB_NAME || !DB_USER || !DB_PASSWORD) return undefined;
  return {
    host: DB_HOST,
    port: Number(DB_PORT ?? 3306),
    database: DB_NAME,
    user: DB_USER,
    password: DB_PASSWORD,
    charset: 'utf8mb4',
    timezone: 'Z',
    connectTimeout: 10_000,
    // Discord-IDs sind grösser als 2^53 und kommen als Text zurück.
    supportBigNumbers: true,
    bigNumberStrings: true,
  };
}

// Ein Pool für den ganzen Bot. Siehe docs/bot/datenbank.md, „Pool“.
export function oeffne(ziel: ConnectionOptions): Pool {
  return mysql.createPool({
    ...ziel,
    connectionLimit: 5,
    maxIdle: 2,
    idleTimeout: 60_000,
    queueLimit: 100,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10_000,
  });
}

// Wendet jede .sql-Datei in `ordner` genau einmal an, nach Namen sortiert, und
// gibt die neuen zurück. Eigene Verbindung, weil nur Migrationen mehrere
// Anweisungen auf einmal schicken dürfen. Siehe docs/bot/datenbank.md, „Migrationen“.
export async function migriere(ziel: ConnectionOptions, ordner: string): Promise<string[]> {
  const verbindung = await mysql.createConnection({ ...ziel, multipleStatements: true });
  try {
    await verbindung.query(
      'CREATE TABLE IF NOT EXISTS migrationen (name VARCHAR(255) PRIMARY KEY, angewendet TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)',
    );
    const [zeilen] = await verbindung.query<RowDataPacket[]>('SELECT name FROM migrationen');
    const fertig = new Set(zeilen.map((zeile) => String(zeile.name)));
    const neu = (await readdir(ordner)).filter((name) => name.endsWith('.sql') && !fertig.has(name)).sort();
    for (const name of neu) {
      await verbindung.query(await readFile(join(ordner, name), 'utf8'));
      await verbindung.query('INSERT INTO migrationen (name) VALUES (?)', [name]);
    }
    return neu;
  } finally {
    await verbindung.end();
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
