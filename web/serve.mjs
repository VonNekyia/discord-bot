// Liefert die Oberfläche aus diesem Ordner aus, mit den Headern aus _headers.
// Für lokal und die CI, nicht für Produktion:
//
//   node serve.mjs [port]
//
// Siehe docs/frontend/auslieferung.md.
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';

const wurzel = import.meta.dirname;
const port = Number(process.argv[2] ?? 4173);
const typen = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};
const kopf = Object.fromEntries(
  (await readFile(join(wurzel, '_headers'), 'utf8'))
    .split('\n')
    .filter((zeile) => zeile.trim() && !zeile.startsWith('#'))
    .map((zeile) => [zeile.slice(0, zeile.indexOf(':')).trim(), zeile.slice(zeile.indexOf(':') + 1).trim()]),
);

createServer(async (anfrage, antwort) => {
  const pfad = decodeURIComponent(new URL(anfrage.url ?? '/', 'http://x').pathname);
  const datei = resolve(wurzel, '.' + (pfad.endsWith('/') ? pfad + 'index.html' : pfad));
  // Nur bekannte Typen und nur unter diesem Ordner, ausser node_modules.
  const erlaubt = datei.startsWith(wurzel + sep) && !datei.includes(sep + 'node_modules' + sep) && typen[extname(datei)];
  try {
    if (!erlaubt) throw new Error();
    const inhalt = await readFile(datei);
    antwort.writeHead(200, { ...kopf, 'Content-Type': typen[extname(datei)] }).end(inhalt);
  } catch {
    antwort.writeHead(404, { ...kopf, 'Content-Type': 'text/plain; charset=utf-8' }).end('Nicht gefunden.');
  }
}).listen(port, '127.0.0.1', () => console.log(`http://127.0.0.1:${port}/`));
