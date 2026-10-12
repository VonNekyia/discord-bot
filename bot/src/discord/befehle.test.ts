import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test, type TestContext } from 'node:test';
import { Events, REST, type Interaction } from 'discord.js';
import { beantworte, registriere, type Befehl } from './befehle.js';
import { DiscordFehler } from './fehler.js';
import { ANWENDUNG, ChannelType, discordClient, gilde, kanal, mitglied, mockDiscord, schliesse, type MockDiscord } from '../testhilfe.js';

// Registrieren und Beantworten von Slash-Befehlen in der Discord-Schicht.
// Alle IDs sind erfunden. Siehe docs/entwicklung/tests.md, „Die gemockte API“.
const SERVER = '300000000000000031';
const PERSON = '200000000000000031';
const TEXT = '520000000000000031';

// Gemockte Discord-API: antwortet der Reihe nach mit den Statuscodes in
// `antworten`, danach mit 200. Siehe docs/entwicklung/tests.md.
async function mockApi(t: TestContext, antworten: number[]) {
  const anfragen: { methode: string; pfad: string; body: string }[] = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (stueck) => (body += stueck));
    req.on('end', () => {
      anfragen.push({ methode: req.method ?? '', pfad: req.url ?? '', body });
      const status = antworten.shift() ?? 200;
      if (status === 429) {
        res.writeHead(429, { 'content-type': 'application/json', 'retry-after': '0', 'x-ratelimit-scope': 'user' });
        res.end(JSON.stringify({ message: 'You are being rate limited.', retry_after: 0, global: false }));
      } else {
        res.writeHead(status, { 'content-type': 'application/json' }).end('[]');
      }
    });
  });
  await new Promise<void>((fertig) => server.listen(0, '127.0.0.1', fertig));
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const { port } = server.address() as AddressInfo;
  const rest = new REST({ api: `http://127.0.0.1:${port}/api`, retries: 1 }).setToken('test');
  return { rest, anfragen };
}

// Ein Befehl, der nur tut, was der Test ihm gibt.
const befehl = (name: string, ausfuehren: Befehl['ausfuehren'] = async () => {}): Befehl => ({ name, beschreibung: `Probe ${name}.`, ausfuehren });

test('registriere ersetzt alle Befehle mit einem PUT', async (t) => {
  const { rest, anfragen } = await mockApi(t, []);
  await registriere(rest, '1', [befehl('eins'), befehl('zwei')]);
  assert.equal(anfragen.length, 1);
  assert.equal(anfragen[0]?.methode, 'PUT');
  assert.equal(anfragen[0]?.pfad, '/api/v10/applications/1/commands');
  // So, wie SlashCommandBuilder sie baut: Typ 1 (Chat Input), keine Optionen.
  assert.deepEqual(JSON.parse(anfragen[0]?.body ?? ''), [
    { name: 'eins', description: 'Probe eins.', options: [], type: 1 },
    { name: 'zwei', description: 'Probe zwei.', options: [], type: 1 },
  ]);
});

test('registriere wartet nach 429 und versucht es noch einmal', async (t) => {
  const { rest, anfragen } = await mockApi(t, [429]);
  await registriere(rest, '1', [befehl('eins')]);
  assert.equal(anfragen.length, 2);
});

test('registriere gibt nach 5xx und einem Versuch auf', async (t) => {
  const { rest, anfragen } = await mockApi(t, [500, 502, 503]);
  await assert.rejects(registriere(rest, '1', [befehl('eins')]));
  assert.equal(anfragen.length, 2);
});

test('registriere wirft bei einem Namen, den Discord nicht nimmt, ohne zu fragen', async (t) => {
  const { rest, anfragen } = await mockApi(t, []);
  await assert.rejects(registriere(rest, '1', [befehl('Gross und leer')]));
  assert.equal(anfragen.length, 0);
});

let mock: MockDiscord;
let zaehler = 0;

before(async () => {
  mock = await mockDiscord();
});

after(async () => {
  await schliesse(mock);
});

// Ruft `/name` auf, wie Discord es schickt, mit einem eigenen Client je
// Aufruf, und gibt die Antworten an Discord und die Logzeilen zurück.
async function ruft(t: TestContext, name: string, befehle: Befehl[]) {
  const log = t.mock.method(console, 'error', () => {});
  const client = discordClient(mock, [gilde(SERVER, 'Befehle', '200000000000000099', [kanal(TEXT, ChannelType.GuildText, 'allgemein', 0, null)])]);
  t.after(async () => {
    await client.destroy();
  });
  zaehler += 1;
  const token = `token-befehl-${zaehler}`;
  const fang: { i?: Interaction } = {};
  client.once(Events.InteractionCreate, (i) => (fang.i = i));
  const aktionen = (client as unknown as { actions: { InteractionCreate: { handle(d: unknown): void } } }).actions;
  aktionen.InteractionCreate.handle({
    id: String(920000000000000000n + BigInt(zaehler)),
    application_id: ANWENDUNG,
    type: 2,
    token,
    version: 1,
    guild_id: SERVER,
    channel: { id: TEXT, type: ChannelType.GuildText },
    channel_id: TEXT,
    member: { ...mitglied(PERSON, []), permissions: '0' },
    app_permissions: '0',
    locale: 'de',
    guild_locale: 'de',
    entitlements: [],
    authorizing_integration_owners: { 0: SERVER },
    context: 0,
    data: { id: '930000000000000001', name, type: 1 },
  });
  assert.ok(fang.i?.isChatInputCommand());
  await beantworte(fang.i, befehle);
  return { antworten: mock.antworten.filter((a) => a.token === token), log: log.mock.calls.map((c) => String(c.arguments[0])), token };
}

test('ein Befehl antwortet gleich, nur dem Nutzer und ohne Erwähnungen', async (t) => {
  const { antworten, log } = await ruft(t, 'probe', [befehl('probe', (a) => a.antworte(`Hallo <@${PERSON}>.`))]);
  const daten = antworten.map((a) => {
    const d = a.daten as { content?: string; flags?: number; allowed_mentions?: unknown };
    return [a.typ, d.content, d.flags, d.allowed_mentions];
  });
  assert.deepEqual(daten, [[4, `Hallo <@${PERSON}>.`, 64, { parse: [] }]]);
  assert.deepEqual(log, []);
});

test('ein unbekannter Befehl bekommt eine Meldung, das Log keine Nutzerdaten', async (t) => {
  const { antworten, log } = await ruft(t, 'gibt-es-nicht', [befehl('probe')]);
  assert.deepEqual(
    antworten.map((a) => [a.typ, a.daten.content, a.daten.flags]),
    [[4, 'Das hat nicht geklappt.', 64]],
  );
  assert.deepEqual(log, ['/gibt-es-nicht: unbekannter Befehl']);
});

test('wirft ein Befehl nach seiner Antwort, kommt die Meldung nach (followUp)', async (t) => {
  const kaputt = befehl('probe', async (a) => {
    await a.antworte('Erst das.');
    throw new Error('kaputt');
  });
  const { antworten, log } = await ruft(t, 'probe', [kaputt]);
  assert.deepEqual(
    antworten.map((a) => [a.typ, a.daten.content, a.daten.flags]),
    [
      [4, 'Erst das.', 64],
      ['nachgereicht', 'Das hat nicht geklappt.', 64],
    ],
  );
  assert.deepEqual(log, ['/probe: kaputt']);
});

test('scheitert die Antwort, wirft antworte DiscordFehler; scheitert auch die Meldung, sagt es das Log ohne Token', async (t) => {
  mock.antwortFehler = [404, 10062];
  t.after(() => {
    mock.antwortFehler = undefined;
  });
  const gesehen: unknown[] = [];
  const probe = befehl('probe', async (a) => {
    await a.antworte('Hallo.').catch((fehler: unknown) => {
      gesehen.push(fehler);
      throw fehler;
    });
  });
  const { antworten, log, token } = await ruft(t, 'probe', [probe]);
  assert.ok(gesehen[0] instanceof DiscordFehler);
  assert.equal(gesehen[0].code, 'anderes');
  assert.deepEqual(antworten, []);
  assert.deepEqual(log, ['/probe: Fehler', '/probe: Antwort fehlgeschlagen: Fehler']);
  assert.ok(log.every((zeile) => !zeile.includes(token) && !zeile.includes(PERSON)));
});
