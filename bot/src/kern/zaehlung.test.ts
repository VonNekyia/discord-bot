import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { route, Zaehlung, type Antwort } from './zaehlung.js';

// Die Zählung ohne Netz. Alle IDs und Tokens sind erfunden.
// Siehe docs/entwicklung/tests.md, „Rate-Limits zählen“.
const KANAL = '500000000000000001';
const TOKEN = 'aW50ZXJhY3Rpb246OTEwMDAwMDAwMDAwMDAwMDAxOnByb2Jl';

// Eine Antwort mit Status und Headern.
function antwort(status: number, kopf: Record<string, string> = {}, pfad = `/channels/${KANAL}/messages`, methode = 'POST'): Antwort {
  return { methode, pfad, status, kopf: (name) => kopf[name] ?? null };
}

describe('Route ohne IDs und Tokens', () => {
  test('Zahlen werden :id, Tokens von Webhooks und Interaktionen :token, Wörter bleiben', () => {
    const faelle: [string, string][] = [
      [`/channels/${KANAL}/messages`, '/channels/:id/messages'],
      [`/guilds/300000000000000001/members/200000000000000002`, '/guilds/:id/members/:id'],
      [`/webhooks/600000000000000001/${TOKEN}/messages/@original`, '/webhooks/:id/:token/messages/@original'],
      [`/interactions/910000000000000001/token-1/callback`, '/interactions/:id/:token/callback'],
      [`/webhooks/600000000000000001/${TOKEN}/messages/%40original`, '/webhooks/:id/:token/messages/@original'],
      ['/oauth2/token/revoke', '/oauth2/token/revoke'],
      ['/users/@me/guilds', '/users/@me/guilds'],
      [`/channels/${KANAL}/messages?limit=5`, '/channels/:id/messages'],
      ['/channels/1/Ab.cd-Unbekannt', '/channels/:id/:token'],
    ];
    for (const [pfad, erwartet] of faelle) assert.equal(route(pfad), erwartet, pfad);
  });
});

describe('Zählung', () => {
  test('ohne Antworten: alle vier eigenen Grenzen mit 0, Zeiten als ISO 8601', (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-10-12T10:00:00.000Z') });
    const z = new Zaehlung({ log: () => {} });
    t.mock.timers.tick(5_000);
    assert.deepEqual(z.stand([0]), {
      seit: '2026-10-12T10:00:00.000Z',
      jetzt: '2026-10-12T10:00:05.000Z',
      shards: [0],
      routen: [],
      rateLimits: { anzahl: 0, global: 0, scope: { user: 0, global: 0, shared: 0 } },
      ungueltig: { letzte10min: 0, warnung: 1000, grenze: 10000 },
      eigene: [
        { name: 'bremse', gegriffen: 0 },
        { name: 'sitzung', gegriffen: 0 },
        { name: 'bausteine', gegriffen: 0 },
        { name: 'testnachricht', gegriffen: 0 },
      ],
    });
  });

  test('je Methode und Route: Anfragen, 429, die letzten Header; nach Anfragen sortiert; eigene Grenzen', () => {
    const z = new Zaehlung({ log: () => {} });
    z.antwort(antwort(200, { 'x-ratelimit-limit': '5', 'x-ratelimit-remaining': '4', 'x-ratelimit-reset-after': '1.5' }));
    z.antwort(antwort(429, { 'x-ratelimit-scope': 'user', 'retry-after': '2' }));
    z.antwort(antwort(200, {}, '/users/@me', 'get'));
    z.antwort(antwort(429, { 'x-ratelimit-scope': 'global', 'x-ratelimit-global': 'true' }, '/users/@me', 'GET'));
    z.antwort(antwort(200, {}, '/users/@me', 'GET'));
    z.griff('sitzung');
    z.griff('sitzung');
    z.griff('bremse');
    const s = z.stand([0]);
    assert.deepEqual(
      s.routen.map((r) => ({ ...r, zuletzt: typeof r.zuletzt })),
      [
        { methode: 'GET', route: '/users/@me', anfragen: 3, rateLimits: 1, limit: null, remaining: null, resetAfter: null, zuletzt: 'string' },
        { methode: 'POST', route: '/channels/:id/messages', anfragen: 2, rateLimits: 1, limit: null, remaining: null, resetAfter: null, zuletzt: 'string' },
      ],
    );
    assert.deepEqual(s.rateLimits, { anzahl: 2, global: 1, scope: { user: 1, global: 1, shared: 0 } });
    assert.deepEqual(s.eigene, [
      { name: 'bremse', gegriffen: 1 },
      { name: 'sitzung', gegriffen: 2 },
      { name: 'bausteine', gegriffen: 0 },
      { name: 'testnachricht', gegriffen: 0 },
    ]);
    // Ein Stand ändert sich nicht, wenn danach weitere Antworten kommen.
    z.antwort(antwort(200, {}, '/users/@me', 'GET'));
    assert.equal(s.routen[0]?.anfragen, 3);
  });

  test('ungültig sind 401, 403 und 429, nicht 429 mit Scope shared; nach 10 min fällt ein Eintrag heraus', (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: 0 });
    const z = new Zaehlung({ log: () => {} });
    z.antwort(antwort(401));
    z.antwort(antwort(403));
    z.antwort(antwort(429, { 'x-ratelimit-scope': 'user' }));
    z.antwort(antwort(429, { 'x-ratelimit-scope': 'shared' }));
    z.antwort(antwort(404));
    z.antwort(antwort(500));
    assert.equal(z.stand([0]).ungueltig.letzte10min, 3);
    assert.equal(z.stand([0]).rateLimits.scope.shared, 1);
    t.mock.timers.tick(10 * 60_000 - 1);
    assert.equal(z.stand([0]).ungueltig.letzte10min, 3);
    t.mock.timers.tick(1);
    assert.equal(z.stand([0]).ungueltig.letzte10min, 0);
  });

  test('die Warnung kommt einmal beim Erreichen von 1000, erst unter 1000 wieder', (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: 0 });
    const log: string[] = [];
    const z = new Zaehlung({ log: (zeile) => log.push(zeile) });
    for (let i = 0; i < 999; i++) z.antwort(antwort(401));
    assert.deepEqual(log, []);
    z.antwort(antwort(403));
    assert.deepEqual(log, ['Rate-Limit: 1000 ungültige Anfragen in 10 min; Warnung ab 1000, Cloudflare sperrt ab 10000.']);
    for (let i = 0; i < 500; i++) z.antwort(antwort(401));
    assert.equal(log.length, 1);
    // Nach 10 min ist das Fenster leer; wer wieder 1000 erreicht, bekommt wieder eine Warnung.
    t.mock.timers.tick(10 * 60_000);
    for (let i = 0; i < 1000; i++) z.antwort(antwort(401));
    assert.equal(log.length, 2);
  });

  test('je 429 genau eine Logzeile: nur Methode, Route, Scope, global und Zahlen', () => {
    const log: string[] = [];
    const z = new Zaehlung({ log: (zeile) => log.push(zeile) });
    const kopf = { 'x-ratelimit-scope': 'user', 'retry-after': '3', 'x-ratelimit-limit': '5', 'x-ratelimit-remaining': '0', 'x-ratelimit-reset-after': '2.5' };
    z.antwort(antwort(429, kopf, `/webhooks/600000000000000001/${TOKEN}/messages/@original`, 'PATCH'));
    z.antwort(antwort(200));
    assert.deepEqual(log, ['Rate-Limit: 429 bei PATCH /webhooks/:id/:token/messages/@original, Scope user, global nein, Retry-After 3 s, Limit 5, Remaining 0, Reset-After 2.5 s.']);
    assert.doesNotMatch(JSON.stringify(z.stand([0])), new RegExp(`${TOKEN}|\\d{17,}`));
  });
});
