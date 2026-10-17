import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test, type TestContext } from 'node:test';
import { Events, REST, type Interaction } from 'discord.js';
import { beantworte, registriere, schlageVor, type Aufruf, type Befehl } from './befehle.js';
import { DiscordFehler } from './fehler.js';
import { ANWENDUNG, ChannelType, discordClient, gilde, kanal, mitglied, mockDiscord, ROLLE_TEAM, schliesse, type MockDiscord } from '../testhilfe.js';

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

test('registriere: Optionen als Pflicht, Text mit max_length und Autocomplete, nur auf Servern', async (t) => {
  const { rest, anfragen } = await mockApi(t, []);
  const mitOptionen: Befehl = {
    ...befehl('strafe'),
    nurServer: true,
    optionen: [
      { art: 'nutzer', name: 'nutzer', beschreibung: 'Wer.' },
      { art: 'text', name: 'grund', beschreibung: 'Warum.', hoechstens: 400, vorschlaege: async () => [] },
    ],
  };
  await registriere(rest, '1', [mitOptionen]);
  assert.deepEqual(JSON.parse(anfragen[0]?.body ?? '')[0], {
    name: 'strafe',
    description: 'Probe strafe.',
    contexts: [0],
    options: [
      { name: 'nutzer', description: 'Wer.', required: true, type: 6 },
      { name: 'grund', description: 'Warum.', required: true, max_length: 400, autocomplete: true, type: 3 },
    ],
    type: 1,
  });
});

const ZIEL = '200000000000000032';

// Eine Interaktion mit Optionen, wie Discord sie schickt: Typ 2 (Befehl)
// oder 4 (Autocomplete); `ziel` steht aufgelöst als Mitglied mit der Rolle Team.
function interaktion(client: ReturnType<typeof discordClient>, typ: 2 | 4, optionen: object[]) {
  zaehler += 1;
  const token = `token-befehl-${zaehler}`;
  const fang: { i?: Interaction } = {};
  client.once(Events.InteractionCreate, (i) => (fang.i = i));
  const aktionen = (client as unknown as { actions: { InteractionCreate: { handle(d: unknown): void } } }).actions;
  const ziel = mitglied(ZIEL, [ROLLE_TEAM]);
  aktionen.InteractionCreate.handle({
    id: String(920000000000000000n + BigInt(zaehler)),
    application_id: ANWENDUNG,
    type: typ,
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
    data: {
      id: '930000000000000001',
      name: 'strafe',
      type: 1,
      options: optionen,
      resolved: { users: { [ZIEL]: ziel.user }, members: { [ZIEL]: { roles: ziel.roles, joined_at: ziel.joined_at, permissions: '0', flags: 0 } } },
    },
  });
  return { i: fang.i, token };
}

test('ein Aufruf liest Optionen, das Ziel mit Rang, zeigt ein Formular; warte und fertig setzen die Antwort', async (t) => {
  t.mock.method(console, 'error', () => {});
  const client = discordClient(mock, [gilde(SERVER, 'Befehle', '200000000000000099', [kanal(TEXT, ChannelType.GuildText, 'allgemein', 0, null)])]);
  t.after(() => client.destroy());
  const gesehen: Record<string, unknown> = {};
  const probe = (tue: (a: Aufruf) => Promise<void>) => ({ ...befehl('strafe'), ausfuehren: tue });
  const optionen = [
    { name: 'nutzer', type: 6, value: ZIEL },
    { name: 'grund', type: 3, value: 'Spam' },
  ];

  const eins = interaktion(client, 2, optionen);
  assert.ok(eins.i?.isChatInputCommand());
  await beantworte(eins.i, [
    probe(async (a) => {
      gesehen.grund = a.text('grund');
      gesehen.ziel = a.ziel('nutzer');
      gesehen.ort = a.ort && { server: a.ort.server.id, wer: a.ort.wer.id, rang: a.ort.rang };
      await a.warte();
      await a.fertig('Erledigt.');
    }),
  ]);
  assert.equal(gesehen.grund, 'Spam');
  assert.deepEqual(gesehen.ziel, {
    person: { id: ZIEL, name: 'nutzer-32', benutzername: 'nutzer-32', bot: false },
    rang: { eigentuemer: false, admin: false, rollen: [ROLLE_TEAM], hoechste: 2 },
  });
  assert.deepEqual(gesehen.ort, { server: SERVER, wer: PERSON, rang: { eigentuemer: false, admin: false, rollen: [], hoechste: 0 } });
  assert.deepEqual(
    mock.antworten.filter((a) => a.token === eins.token).map((a) => [a.typ, a.daten.content, a.daten.flags]),
    [
      [5, undefined, 64],
      ['bearbeitet', 'Erledigt.', undefined],
    ],
  );

  const zwei = interaktion(client, 2, optionen);
  assert.ok(zwei.i?.isChatInputCommand());
  const formular = { id: 'strafe:ban:1', titel: 'Eigener Grund', feld: { id: 'wert', label: 'Grund', beschreibung: 'Warum.', min: 1, max: 400, wert: '' } };
  await beantworte(zwei.i, [probe((a) => a.zeigeFormular(formular))]);
  const modal = mock.antworten.find((a) => a.token === zwei.token);
  assert.equal(modal?.typ, 9);
  assert.equal(modal?.daten.custom_id, 'strafe:ban:1');
  assert.equal(modal?.daten.title, 'Eigener Grund');

  // Wirft der Befehl nach `warte`, ersetzt der Fehlersatz die aufgeschobene Antwort.
  const drei = interaktion(client, 2, optionen);
  assert.ok(drei.i?.isChatInputCommand());
  await beantworte(drei.i, [
    probe(async (a) => {
      await a.warte();
      throw new Error('kaputt');
    }),
  ]);
  assert.deepEqual(
    mock.antworten.filter((a) => a.token === drei.token).map((a) => [a.typ, a.daten.content]),
    [
      [5, undefined],
      ['bearbeitet', 'Das hat nicht geklappt.'],
    ],
  );
});

test('Autocomplete: die Vorschläge der Option, höchstens 25; aus oder bei einem Fehler eine leere Liste', async (t) => {
  const log = t.mock.method(console, 'error', () => {});
  const client = discordClient(mock, [gilde(SERVER, 'Befehle', '200000000000000099', [])]);
  t.after(() => client.destroy());
  const eingaben: string[] = [];
  const mitVorschlaegen = (vorschlaege: (e: string) => Promise<{ name: string; wert: string }[]>): Befehl => ({
    ...befehl('strafe'),
    optionen: [{ art: 'text', name: 'grund', beschreibung: 'Warum.', hoechstens: 400, vorschlaege: async (e) => (eingaben.push(e), vorschlaege(e)) }],
  });
  const viele = async () => Array.from({ length: 30 }, (_, n) => ({ name: `Grund ${n}`, wert: `g${n}` }));
  const getippt = [{ name: 'grund', type: 3, value: 'sp', focused: true }];

  const eins = interaktion(client, 4, getippt);
  assert.ok(eins.i?.isAutocomplete());
  await schlageVor(eins.i, [mitVorschlaegen(viele)], true);
  const antwort = mock.antworten.find((a) => a.token === eins.token);
  assert.equal(antwort?.typ, 8);
  const auswahl = (antwort?.daten as { choices?: { name: string; value: string }[] } | undefined)?.choices ?? [];
  assert.equal(auswahl.length, 25);
  assert.deepEqual(auswahl[0], { name: 'Grund 0', value: 'g0' });
  assert.deepEqual(eingaben, ['sp']);

  const zwei = interaktion(client, 4, getippt);
  assert.ok(zwei.i?.isAutocomplete());
  await schlageVor(zwei.i, [mitVorschlaegen(viele)], false);
  assert.deepEqual(mock.antworten.find((a) => a.token === zwei.token)?.daten, { choices: [] });

  const drei = interaktion(client, 4, getippt);
  assert.ok(drei.i?.isAutocomplete());
  await schlageVor(drei.i, [mitVorschlaegen(async () => {
    throw new Error('Datenbank weg');
  })], true);
  assert.deepEqual(mock.antworten.find((a) => a.token === drei.token)?.daten, { choices: [] });
  assert.deepEqual(log.mock.calls.map((c) => String(c.arguments[0])), ['/strafe: Vorschläge fehlgeschlagen: Datenbank weg']);
});
