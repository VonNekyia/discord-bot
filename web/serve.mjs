// Liefert die Oberfläche aus diesem Ordner aus, mit den Headern aus _headers,
// und leitet /api/ an den Bot weiter. Für lokal und die CI, nicht für
// Produktion:
//
//   node serve.mjs [port]
//
// Siehe docs/frontend/auslieferung.md.
import { readFile } from 'node:fs/promises';
import { createServer, request } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';

const wurzel = import.meta.dirname;
const port = Number(process.argv[2] ?? 4173);
const apiPort = Number(process.env.API_PORT ?? 4174);
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

// Reicht die Anfrage unverändert an den Bot und seine Antwort unverändert
// zurück, auch Set-Cookie und Location. Antwortet er nicht: 502.
// Siehe docs/schnittstelle/api.md, „Lokal“.
function weiterleiten(anfrage, antwort) {
  const weiter = request(
    { host: '127.0.0.1', port: apiPort, method: anfrage.method, path: anfrage.url, headers: anfrage.headers },
    (bot) => {
      antwort.writeHead(bot.statusCode ?? 502, bot.rawHeaders);
      bot.pipe(antwort);
    },
  );
  weiter.on('error', () => {
    if (antwort.headersSent) {
      antwort.destroy();
      return;
    }
    antwort
      .writeHead(502, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
      .end('{"code":"nicht_erreichbar"}');
  });
  anfrage.pipe(weiter);
}

createServer(async (anfrage, antwort) => {
  if (anfrage.url?.startsWith('/api/')) return weiterleiten(anfrage, antwort);
  try {
    const pfad = decodeURIComponent(new URL(anfrage.url ?? '/', 'http://x').pathname);
    const datei = resolve(wurzel, `.${pfad.endsWith('/') ? `${pfad}index.html` : pfad}`);
    // Nur bekannte Typen und nur unter diesem Ordner, ausser node_modules.
    const erlaubt = datei.startsWith(`${wurzel}${sep}`) && !datei.includes(`${sep}node_modules${sep}`) && typen[extname(datei)];
    if (!erlaubt) throw new Error('nicht erlaubt');
    const inhalt = await readFile(datei);
    antwort.writeHead(200, { ...kopf, 'Content-Type': typen[extname(datei)] }).end(inhalt);
  } catch {
    antwort.writeHead(404, { ...kopf, 'Content-Type': 'text/plain; charset=utf-8' }).end('Nicht gefunden.');
  }
}).listen(port, '127.0.0.1', () => console.log(`http://127.0.0.1:${port}/`));
