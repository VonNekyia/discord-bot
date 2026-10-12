import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, beforeEach, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { ChannelType, PermissionFlagsBits as R, type Client, type Guild } from 'discord.js';
import type { Pool } from 'pg';
import { legeSitzungAn } from '../../api/anmeldung.js';
import { erstelleApi } from '../../api/server.js';
import { Aufraeumen } from '../../kern/aufraeumen.js';
import { alleModule } from '../../modulliste.js';
import { ladeCache } from '../../kern/cache.js';
import { migriere, oeffne, verbindung } from '../../kern/datenbank.js';
import { Zaehlung } from '../../kern/zaehlung.js';
import { dashboardGriff } from '../../discord/dashboard.js';
import { serverVon, type Server as Griff } from '../../discord/server.js';
import { Raeume } from './raeume.js';
import { sprachraeumeBereich } from './seiten.js';
import { hoechstens, liesSprachraeume, speichereSprachraeume, type Sprachraeume } from './sprachraeume.js';
import {
  ANWENDUNG,
  BOT,
  DASHBOARD,
  discordClient,
  frage,
  GEHEIMNIS,
  kanal,
  mitglied,
  mockDiscord,
  rolle,
  ROLLE_BOT,
  ROLLE_TEAM,
  schliesse,
  type MockDiscord,
} from '../../testhilfe.js';

// Gegen eine gemockte Discord-API und eine echte PostgreSQL; ohne DB_HOST
// übersprungen, in der CI immer dabei. Alle IDs sind erfunden.
// Siehe docs/entwicklung/tests.md, „Die API des Dashboards“.
const ziel = verbindung();
if (!ziel && process.env.CI) throw new Error('In der CI muss die Datenbank da sein: DB_* fehlt.');

const SERVER = '300000000000000008';
const BESITZER = '200000000000000021';
const ANDERER = '200000000000000022';
// Eine eigene Person für die Sitzungen; api.test.ts läuft gleichzeitig und räumt PERSON weg.
const TEAM = '200000000000000023';
const K = {
  privat: '510000000000000001',
  stream: '510000000000000002',
  erzeuger: '510000000000000011',
  ohneKategorie: '510000000000000012',
  erzeugerStream: '510000000000000013',
  ohneVerschieben: '510000000000000014',
  text: '510000000000000015',
  buehne: '510000000000000016',
};
const sieht = R.ViewChannel | R.Connect;
// Was der Bot auf dem Server hat: alles für die Sprachräume, dazu Speak, nicht Stream.
const botRechte = R.ManageChannels | R.ManageRoles | R.MoveMembers | R.ViewChannel | R.Connect | R.SendMessages | R.ReadMessageHistory | R.Speak;

const eintrag = (id: string, type: number, allow: bigint, deny: bigint) => ({ id, type, allow: String(allow), deny: String(deny) });
// Eine private Kategorie: @everyone sieht nichts, der Bot und das Team schon, der Besitzer hat einen eigenen Eintrag.
const privat = [
  eintrag(SERVER, 0, 0n, R.ViewChannel),
  eintrag(ROLLE_BOT, 0, sieht, 0n),
  eintrag(ROLLE_TEAM, 0, R.Connect | R.Speak, 0n),
  eintrag(BESITZER, 1, R.Speak, R.Connect),
];

function server() {
  const sprachkanal = (id: string, name: string, position: number, parent: string | null, ueberschreibt: object[] = []) => ({
    ...kanal(id, ChannelType.GuildVoice, name, position, parent),
    permission_overwrites: ueberschreibt,
  });
  return {
    id: SERVER,
    name: 'Sprache',
    icon: null,
    owner_id: '200000000000000099',
    member_count: 10,
    features: [],
    emojis: [],
    stickers: [],
    roles: [rolle(SERVER, '@everyone', 0n, 0), rolle(ROLLE_BOT, 'kitty', botRechte, 1), rolle(ROLLE_TEAM, 'Team', R.ManageGuild, 2)],
    channels: [
      { ...kanal(K.privat, ChannelType.GuildCategory, 'Privat', 0, null), permission_overwrites: privat },
      { ...kanal(K.stream, ChannelType.GuildCategory, 'Stream', 1, null), permission_overwrites: [eintrag(SERVER, 0, 0n, R.Stream)] },
      sprachkanal(K.erzeuger, '➕ Talk', 0, K.privat, privat),
      sprachkanal(K.ohneVerschieben, 'Ohne', 1, K.privat, [eintrag(ROLLE_BOT, 0, sieht, R.MoveMembers)]),
      sprachkanal(K.ohneKategorie, '➕ Offen', 3, null),
      sprachkanal(K.erzeugerStream, '➕ Stream', 0, K.stream),
      kanal(K.text, ChannelType.GuildText, 'text', 2, null),
      kanal(K.buehne, ChannelType.GuildStageVoice, 'Bühne', 4, null),
    ],
    members: [mitglied(BOT, [ROLLE_BOT])],
  };
}

describe('Sprachräume', { skip: ziel ? false : 'keine Datenbank, DB_HOST fehlt' }, () => {
  let db: Pool;
  let aufraeumer: Aufraeumen;
  let mock: MockDiscord;
  let client: Client;
  let guild: Guild;
  // Der Griff, mit dem der Bot das Modul aufruft.
  let griff: Griff;
  let jetzt = Date.now();

  before(async () => {
    if (!ziel) return;
    await migriere(ziel, fileURLToPath(new URL('../../../migrationen', import.meta.url)));
    db = oeffne(ziel);
    // Wie im Bot: die Tabellen aller Module.
    aufraeumer = new Aufraeumen(alleModule({ db, zaehlung: new Zaehlung(), einstellungen: new Map(), sprachraeume: new Map() }));
    mock = await mockDiscord();
    client = discordClient(mock, [server()]);
    guild = client.guilds.cache.get(SERVER) as Guild;
    griff = serverVon(guild);
  });

  beforeEach(async () => {
    if (!ziel) return;
    for (const liste of [mock.angelegt, mock.verschoben, mock.geloescht, mock.nachrichten]) liste.length = 0;
    mock.anlegenFehler = undefined;
    mock.verschiebenFehler = undefined;
    mock.loeschenFehler = undefined;
    mock.nachrichtFehler = undefined;
    guild.voiceStates.cache.clear();
    for (const id of guild.channels.cache.keys()) if (BigInt(id) >= 800000000000000000n) guild.channels.cache.delete(id);
    await aufraeumer.vergiss(db, SERVER);
    mock.mitglieder.set(`${SERVER}/${BESITZER}`, mitglied(BESITZER, [], { global_name: 'Mia' }));
    mock.mitglieder.set(`${SERVER}/${ANDERER}`, mitglied(ANDERER, [], { global_name: 'Ben' }));
  });

  after(async () => {
    if (!ziel) return;
    await aufraeumer.vergiss(db, SERVER);
    await db.query('DELETE FROM sitzungen WHERE nutzer = $1', [TEAM]);
    await schliesse(mock);
    await client.destroy();
    await db.end();
  });

  const standard: Sprachraeume = { an: true, erzeuger: [{ kanal: K.erzeuger, kategorie: null, name: '{name}s Raum', limit: 4 }] };
  const raeume = () =>
    new Raeume({ db, einstellungen: ladeCache((s: string) => liesSprachraeume(db, s)), uhr: () => jetzt, warten: 30 });
  // Ein Mitglied steht in `kanal`, wie die Voice States von Discord es melden.
  const stimme = (nutzer: string, kanalId: string | null) =>
    (guild.voiceStates as unknown as { _add(d: unknown): unknown })._add({
      user_id: nutzer,
      channel_id: kanalId,
      guild_id: SERVER,
      session_id: 'sitzung',
      deaf: false,
      mute: false,
      self_deaf: false,
      self_mute: false,
      self_video: false,
      suppress: false,
      request_to_speak_timestamp: null,
    });
  // Betritt `kanal` und wartet, bis der Bot fertig ist.
  const betritt = async (r: Raeume, nutzer: string, kanalId: string, vorher: string | null = null) => {
    stimme(nutzer, kanalId);
    await r.aenderung(griff, nutzer, vorher, kanalId);
  };
  const zeile = async (kanalId: string) => (await db.query('SELECT server, besitzer FROM raeume WHERE kanal = $1', [kanalId])).rows[0];
  const sortiert = <T extends { id: string }>(liste: T[]) => liste.toSorted((a, b) => a.id.localeCompare(b.id));

  test('ein Erzeuger legt den Raum mit den Einträgen der Kategorie, des Besitzers und des Bots in einem Aufruf an', async () => {
    await speichereSprachraeume(db, SERVER, standard);
    await betritt(raeume(), BESITZER, K.erzeuger);
    assert.equal(mock.angelegt.length, 1);
    const neu = mock.angelegt[0];
    assert.deepEqual([neu?.name, neu?.type, neu?.parent_id, neu?.user_limit], ['Mias Raum', 2, K.privat, 4]);
    assert.deepEqual(
      sortiert(neu?.permission_overwrites ?? []),
      sortiert([
        eintrag(SERVER, 0, 0n, R.ViewChannel),
        eintrag(ROLLE_BOT, 0, sieht, 0n),
        eintrag(ROLLE_TEAM, 0, R.Connect | R.Speak, 0n),
        // Zusammengeführt: Speak aus der Kategorie, Connect nicht mehr verboten.
        eintrag(BESITZER, 1, R.Speak | R.ViewChannel | R.Connect | R.ReadMessageHistory, 0n),
        eintrag(BOT, 1, R.ViewChannel | R.Connect | R.SendMessages, 0n),
      ]),
    );
    const raum = [...guild.channels.cache.keys()].find((id) => BigInt(id) >= 800000000000000000n) ?? '';
    assert.deepEqual(mock.verschoben, [{ nutzer: BESITZER, kanal: raum, grund: 'Sprachraum angelegt' }]);
    assert.deepEqual(await zeile(raum), { server: SERVER, besitzer: BESITZER });
  });

  test('nach dem Anlegen kommt das Menü in den Textchat des Raums: zwölf Knöpfe in drei Reihen', async () => {
    await speichereSprachraeume(db, SERVER, standard);
    await betritt(raeume(), BESITZER, K.erzeuger);
    const raum = mock.verschoben[0]?.kanal ?? '';
    assert.equal(mock.nachrichten.length, 1);
    const menue = mock.nachrichten[0];
    assert.equal(menue?.kanal, raum);
    assert.match(menue?.json.content ?? '', /^## Dein Sprachraum\n/);
    assert.deepEqual(menue?.json.allowed_mentions, { parse: [] });
    const reihen = menue?.json.components ?? [];
    assert.deepEqual(
      reihen.map((r) => r.components.length),
      [4, 4, 4],
    );
    const knoepfe = reihen.flatMap((r) => r.components);
    assert.ok(knoepfe.every((k) => k.type === 2 && k.custom_id?.startsWith('sprachraum:')));
    assert.deepEqual(knoepfe.map((k) => k.label).toSorted(), [
      'Bannen',
      'Besitz übergeben',
      'Entbannen',
      'Entsperren',
      'Info',
      'Limit',
      'Rauswerfen',
      'Sperren',
      'Umbenennen',
      'Verstecken',
      'Zeigen',
      'Übernehmen',
    ]);
  });

  test('scheitert das Menü, bleibt der Raum ohne Knöpfe; eine Logzeile ohne IDs', async (t) => {
    const log = t.mock.method(console, 'error', () => {});
    await speichereSprachraeume(db, SERVER, standard);
    mock.nachrichtFehler = [403, 50013];
    await betritt(raeume(), BESITZER, K.erzeuger);
    const raum = mock.verschoben[0]?.kanal ?? '';
    assert.deepEqual(await zeile(raum), { server: SERVER, besitzer: BESITZER });
    assert.deepEqual(mock.geloescht, []);
    assert.equal(log.mock.callCount(), 1);
    const zeileLog = String(log.mock.calls[0]?.arguments[0]);
    assert.match(zeileLog, /^Sprachraum: Menü nicht gesendet: /);
    assert.doesNotMatch(zeileLog, /\d{17,}/);
  });

  test('ohne Kategorie hat der Raum nur die Einträge von Besitzer und Bot', async () => {
    await speichereSprachraeume(db, SERVER, { an: true, erzeuger: [{ kanal: K.ohneKategorie, kategorie: null, name: 'Raum', limit: 0 }] });
    await betritt(raeume(), BESITZER, K.ohneKategorie);
    assert.deepEqual(mock.angelegt[0]?.parent_id ?? null, null);
    assert.deepEqual(
      sortiert(mock.angelegt[0]?.permission_overwrites ?? []),
      sortiert([eintrag(BESITZER, 1, R.ViewChannel | R.Connect | R.ReadMessageHistory, 0n), eintrag(BOT, 1, R.ViewChannel | R.Connect | R.SendMessages, 0n)]),
    );
  });

  test('wer schon einen Raum hat, kommt zurück in den eigenen, ohne neuen', async () => {
    await speichereSprachraeume(db, SERVER, standard);
    const r = raeume();
    await betritt(r, BESITZER, K.erzeuger);
    const raum = mock.verschoben[0]?.kanal ?? '';
    stimme(BESITZER, raum);
    await betritt(r, BESITZER, K.erzeuger, raum);
    assert.equal(mock.angelegt.length, 1);
    assert.deepEqual(mock.verschoben.at(-1), { nutzer: BESITZER, kanal: raum, grund: 'Sprachraum: in den eigenen Raum' });
  });

  test('höchstens ein neuer Raum je 30 s und Mitglied', async () => {
    await speichereSprachraeume(db, SERVER, standard);
    const r = raeume();
    await betritt(r, BESITZER, K.erzeuger);
    const raum = mock.verschoben[0]?.kanal ?? '';
    await guild.channels.delete(raum);
    await r.geloescht(raum);
    jetzt += 29_000;
    await betritt(r, BESITZER, K.erzeuger);
    assert.equal(mock.angelegt.length, 1);
    jetzt += 1_000;
    await betritt(r, BESITZER, K.erzeuger);
    assert.equal(mock.angelegt.length, 2);
  });

  test('ein Raum je Mitglied: zwei schnelle Beitritte legen einen an, die Tabelle nimmt keinen zweiten', async () => {
    await speichereSprachraeume(db, SERVER, standard);
    const r = raeume();
    stimme(BESITZER, K.erzeuger);
    await Promise.all([r.aenderung(griff, BESITZER, null, K.erzeuger), r.aenderung(griff, BESITZER, null, K.erzeuger)]);
    assert.equal(mock.angelegt.length, 1);
    const raum = mock.verschoben[0]?.kanal ?? '';
    await assert.rejects(
      db.query('INSERT INTO raeume (kanal, server, besitzer) VALUES ($1, $2, $3)', ['899999999999999999', SERVER, BESITZER]),
      /unique|eindeutig/i,
    );
    assert.ok(await zeile(raum));
  });

  test('ein leerer Raum geht nach der Wartezeit, nicht wenn inzwischen jemand drin ist', async () => {
    await speichereSprachraeume(db, SERVER, standard);
    const r = raeume();
    await betritt(r, BESITZER, K.erzeuger);
    const raum = mock.verschoben[0]?.kanal ?? '';

    // Jemand kommt, bevor die Wartezeit um ist: Der Raum bleibt.
    stimme(BESITZER, null);
    const leer = r.aenderung(griff, BESITZER, raum, null);
    stimme(ANDERER, raum);
    await leer;
    assert.deepEqual(mock.geloescht, []);

    stimme(ANDERER, null);
    await r.aenderung(griff, ANDERER, raum, null);
    assert.deepEqual(mock.geloescht, [raum]);
    assert.equal(await zeile(raum), undefined);
  });

  test('ist ein leerer Raum bei Discord schon weg (10003), vergisst der Bot ihn ohne Logzeile', async (t) => {
    const log = t.mock.method(console, 'error', () => {});
    await speichereSprachraeume(db, SERVER, standard);
    const r = raeume();
    await betritt(r, BESITZER, K.erzeuger);
    const raum = mock.verschoben[0]?.kanal ?? '';
    mock.loeschenFehler = [404, 10003];
    stimme(BESITZER, null);
    await r.aenderung(griff, BESITZER, raum, null);
    assert.equal(await zeile(raum), undefined);
    assert.equal(log.mock.callCount(), 0);
  });

  test('geht das Mitglied, bevor das Verschieben klappt (40032), geht der neue Raum wieder, ohne Logzeile', async (t) => {
    const log = t.mock.method(console, 'error', () => {});
    await speichereSprachraeume(db, SERVER, standard);
    mock.verschiebenFehler = [400, 40032];
    await betritt(raeume(), BESITZER, K.erzeuger);
    assert.equal(mock.angelegt.length, 1);
    assert.equal(mock.geloescht.length, 1);
    assert.equal((await db.query('SELECT 1 FROM raeume WHERE server = $1', [SERVER])).rowCount, 0);
    assert.equal(log.mock.callCount(), 0);
  });

  test('fehlt dem Bot ein Recht (50013), legt er nichts an; eine Logzeile ohne IDs', async (t) => {
    const log = t.mock.method(console, 'error', () => {});
    await speichereSprachraeume(db, SERVER, standard);
    mock.anlegenFehler = [403, 50013];
    await betritt(raeume(), BESITZER, K.erzeuger);
    assert.deepEqual([mock.angelegt.length, mock.verschoben.length], [0, 0]);
    const zeilen = log.mock.calls.map((c) => String(c.arguments[0]));
    assert.equal(zeilen.length, 1);
    assert.match(zeilen[0] ?? '', /^Sprachraum: nicht angelegt: /);
    assert.doesNotMatch(zeilen[0] ?? '', /\d{17}/);
  });

  test('ist die Art aus oder der Kanal kein Erzeuger, passiert nichts', async () => {
    await speichereSprachraeume(db, SERVER, { ...standard, an: false });
    await betritt(raeume(), BESITZER, K.erzeuger);
    await speichereSprachraeume(db, SERVER, standard);
    await betritt(raeume(), BESITZER, K.ohneKategorie);
    assert.deepEqual([mock.angelegt.length, mock.verschoben.length], [0, 0]);
  });

  test('der Abgleich beim Start vergisst Räume ohne Kanal, löscht leere und lässt belegte', async () => {
    const [weg, leer, voll] = ['880000000000000001', '880000000000000002', '880000000000000003'];
    const kanaele = client.channels as unknown as { _add(d: unknown, g: Guild): unknown };
    for (const id of [leer, voll]) kanaele._add({ id, type: ChannelType.GuildVoice, name: 'Raum', position: 9, parent_id: null, permission_overwrites: [] }, guild);
    for (const [i, id] of [weg, leer, voll].entries()) {
      await db.query('INSERT INTO raeume (kanal, server, besitzer) VALUES ($1, $2, $3)', [id, SERVER, `20000000000000003${i}`]);
    }
    stimme(ANDERER, voll);
    await raeume().gleicheAb([griff]);
    assert.deepEqual(mock.geloescht, [leer]);
    const uebrig = (await db.query<{ kanal: string }>('SELECT kanal FROM raeume WHERE server = $1', [SERVER])).rows.map((z) => z.kanal);
    assert.deepEqual(uebrig, [voll]);
  });

  test('channelDelete vergisst den Raum, guildDelete und der Abgleich löschen Einstellungen und Räume', async () => {
    await speichereSprachraeume(db, SERVER, standard);
    const r = raeume();
    await betritt(r, BESITZER, K.erzeuger);
    const raum = mock.verschoben[0]?.kanal ?? '';
    await r.geloescht(raum);
    assert.equal(await zeile(raum), undefined);

    await db.query('INSERT INTO raeume (kanal, server, besitzer) VALUES ($1, $2, $3)', ['880000000000000009', SERVER, BESITZER]);
    await aufraeumer.vergiss(db, SERVER);
    const zahl = async () =>
      (await db.query('SELECT (SELECT count(*) FROM sprachraeume WHERE server = $1) + (SELECT count(*) FROM raeume WHERE server = $1) AS n', [SERVER])).rows[0].n;
    assert.equal(await zahl(), '0');

    // Der Abgleich in einer Transaktion, die zurückrollt; so bleiben fremde Zeilen der Dev-Datenbank.
    await speichereSprachraeume(db, SERVER, standard);
    const verbindung = await db.connect();
    try {
      await verbindung.query('BEGIN');
      const andere = await verbindung.query<{ server: string }>('SELECT server FROM sprachraeume WHERE server <> $1', [SERVER]);
      assert.ok((await aufraeumer.behalteNur(verbindung, andere.rows.map((z) => z.server))) >= 1);
      assert.equal((await verbindung.query('SELECT 1 FROM sprachraeume WHERE server = $1', [SERVER])).rowCount, 0);
    } finally {
      await verbindung.query('ROLLBACK');
      verbindung.release();
    }
  });

  test('die Grenze von 30 s vergisst ein Mitglied nach ihrer Zeit', async () => {
    await speichereSprachraeume(db, SERVER, standard);
    // Eine falsche Uhr nur für das Vergessen: Die Zeit läuft erst mit `vor`,
    // egal wie lange Datenbank, Verschieben und Menü in `betritt` brauchen.
    let jetztFalsch = 0;
    const geplant: { um: number; fn: () => void; ab: boolean }[] = [];
    const planen = (fn: () => void, ms: number) => {
      const eintrag = { um: jetztFalsch + ms, fn, ab: false };
      geplant.push(eintrag);
      return () => {
        eintrag.ab = true;
      };
    };
    const vor = (ms: number) => {
      jetztFalsch += ms;
      for (const e of geplant) {
        if (e.ab || e.um > jetztFalsch) continue;
        e.ab = true;
        e.fn();
      }
    };
    const r = new Raeume({ db, einstellungen: ladeCache((s: string) => liesSprachraeume(db, s)), warten: 30, planen });
    await betritt(r, BESITZER, K.erzeuger);
    assert.equal(r.gemerkt, 1);
    vor(29_999);
    assert.equal(r.gemerkt, 1);
    vor(1);
    assert.equal(r.gemerkt, 0);
  });

  describe('API', () => {
    let api: Server;
    let basis: string;
    const geleert: string[] = [];

    before(async () => {
      if (!ziel) return;
      api = erstelleApi({
        griff: dashboardGriff(client, { zaehlung: new Zaehlung() }),
        db,
        anwendung: ANWENDUNG,
        geheimnis: GEHEIMNIS,
        dashboard: DASHBOARD,
        bereiche: [sprachraeumeBereich({ db, sprachraeume: { delete: (s) => geleert.push(s) } })],
      });
      await new Promise<void>((fertig) => api.listen(0, '127.0.0.1', fertig));
      basis = `http://127.0.0.1:${(api.address() as AddressInfo).port}`;
    });

    after(async () => {
      if (!ziel) return;
      api.closeAllConnections();
      await new Promise((fertig) => api.close(fertig));
    });

    const sitzung = async () => {
      mock.mitglieder.set(`${SERVER}/${TEAM}`, mitglied(TEAM, [ROLLE_TEAM]));
      return legeSitzungAn(db, { nutzer: TEAM, name: 'Team', avatar: null, server: [SERVER] });
    };
    type Baustein = { art: string; id: string; titel?: string; optionen?: unknown[]; einmalig?: string; vergeben?: string; bausteine?: Baustein[] };
    type Seite = { id: string; wert: unknown; bausteine: Baustein[]; fund: unknown };
    const seite = async (kennung: string) => {
      const antwort = await frage(basis, `/api/server/${SERVER}/seiten`, { sitzung: kennung });
      assert.equal(antwort.status, 200);
      const [erste] = (await antwort.json()) as Seite[];
      assert.equal(erste?.id, 'sprachraeume');
      return erste;
    };
    // Die Optionen einer Auswahl in der Liste der Erzeuger.
    const optionen = (s: Seite | undefined, id: string) => s?.bausteine.find((b) => b.id === 'erzeuger')?.bausteine?.find((b) => b.id === id)?.optionen;
    const put = async (kennung: string, body: unknown) =>
      frage(basis, `/api/server/${SERVER}/seiten/sprachraeume`, {
        method: 'PUT',
        sitzung: kennung,
        headers: { origin: DASHBOARD, 'content-type': 'application/json' },
        body: typeof body === 'string' ? body : JSON.stringify(body),
      });

    test('die Seite bietet Sprachkanäle und Kategorien; ohne Recht gesperrt, auch für ein Recht in der Kategorie, das der Bot nicht hat', async () => {
      const s = await seite(await sitzung());
      assert.deepEqual(
        s?.bausteine.map((b) => `${b.art}:${b.id}`),
        ['schalter:an', 'liste:erzeuger'],
      );
      assert.deepEqual(
        s?.bausteine[1]?.bausteine?.map((b) => `${b.art}:${b.id}`),
        ['auswahl:kanal', 'auswahl:kategorie', 'text:name', 'zahl:limit'],
      );
      // Die Liste hat keine eigene Überschrift; ein schon gewählter Erzeuger heisst „schon gewählt“.
      assert.equal(s?.bausteine[1]?.titel, undefined);
      const kanal = s?.bausteine[1]?.bausteine?.[0];
      assert.deepEqual([kanal?.einmalig, kanal?.vergeben], ['erzeuger_doppelt', 'schon gewählt']);
      const privatK = { id: K.privat, name: 'Privat' };
      const fehlt = (code: string) => ({ grund: 'kitty fehlt ein Recht', code });
      assert.deepEqual(optionen(s, 'kanal'), [
        { id: K.ohneKategorie, name: '➕ Offen', gruppe: null, merkmale: [], gesperrt: null },
        { id: K.erzeuger, name: '➕ Talk', gruppe: privatK, merkmale: [], gesperrt: null },
        { id: K.ohneVerschieben, name: 'Ohne', gruppe: privatK, merkmale: [], gesperrt: fehlt('erzeuger_ohne_recht') },
        { id: K.erzeugerStream, name: '➕ Stream', gruppe: { id: K.stream, name: 'Stream' }, merkmale: [], gesperrt: null },
      ]);
      assert.deepEqual(optionen(s, 'kategorie'), [
        { id: K.privat, name: 'Privat', gruppe: null, merkmale: [], gesperrt: null },
        { id: K.stream, name: 'Stream', gruppe: null, merkmale: [], gesperrt: fehlt('kategorie_ohne_recht') },
      ]);
    });

    test('fehlt dem Bot ein Recht auf dem Server, steht oben ein Hinweis', async () => {
      const kitty = guild.roles.cache.get(ROLLE_BOT) as unknown as { _patch(d: unknown): void };
      kitty._patch({ permissions: String(botRechte & ~R.ManageChannels) });
      try {
        const s = await seite(await sitzung());
        assert.deepEqual(
          s?.bausteine.map((b) => `${b.art}:${b.id}`),
          ['hinweis:rechte', 'schalter:an', 'liste:erzeuger'],
        );
      } finally {
        kitty._patch({ permissions: String(botRechte) });
      }
      assert.equal((await seite(await sitzung()))?.bausteine[0]?.art, 'schalter');
    });

    test('die Seite liefert ohne Zeile die Standardwerte und speichert, was passt', async () => {
      const kennung = await sitzung();
      const leer = await seite(kennung);
      assert.deepEqual(leer?.wert, { an: false, erzeuger: [] });
      assert.equal(leer?.fund, null);
      geleert.length = 0;
      const gut = { an: true, erzeuger: [{ kanal: K.erzeuger, kategorie: null, name: `${'x'.repeat(68)}{name}`, limit: 99 }] };
      const antwort = await put(kennung, { ...gut, fremd: 1 });
      assert.equal(antwort.status, 200);
      assert.deepEqual(await antwort.json(), { wert: gut, meldung: { titel: 'Gespeichert.', text: 'Wer den Erzeuger betritt, bekommt einen Raum.' } });
      assert.deepEqual(geleert, [SERVER]);
      assert.deepEqual((await seite(kennung))?.wert, gut);
    });

    test('Räume stehen nicht unter den Optionen und lassen sich nicht als Erzeuger speichern', async () => {
      const raum = '880000000000000011';
      (client.channels as unknown as { _add(d: unknown, g: Guild): unknown })._add(
        { id: raum, type: ChannelType.GuildVoice, name: 'Mias Raum', position: 5, parent_id: null, permission_overwrites: [] },
        guild,
      );
      await db.query('INSERT INTO raeume (kanal, server, besitzer) VALUES ($1, $2, $3)', [raum, SERVER, BESITZER]);
      const kennung = await sitzung();
      const liste = (optionen(await seite(kennung), 'kanal') ?? []) as { id: string }[];
      assert.ok(liste.length > 0);
      assert.ok(!liste.some((k) => k.id === raum));
      const antwort = await put(kennung, { an: true, erzeuger: [{ kanal: raum, kategorie: null, name: 'Raum', limit: 0 }] });
      assert.deepEqual(await antwort.json(), { code: 'erzeuger_unbekannt', feld: 'erzeuger.0.kanal' });
    });

    test('jede Prüfregel meldet ihren Code und den Pfad des Felds', async () => {
      const kennung = await sitzung();
      const e = (aenderung: object = {}) => ({ kanal: K.erzeuger, kategorie: null, name: 'Raum', limit: 2, ...aenderung });
      const faelle: [unknown, string, string][] = [
        ['{kaputt', 'ungueltig', 'an'],
        [{ an: 'ja', erzeuger: [] }, 'ungueltig', 'an'],
        [{ an: true, erzeuger: {} }, 'ungueltig', 'erzeuger'],
        [{ an: true, erzeuger: [e(), 5] }, 'ungueltig', 'erzeuger.1'],
        [{ an: true, erzeuger: [e(), [K.erzeuger]] }, 'ungueltig', 'erzeuger.1'],
        [{ an: true, erzeuger: [e(), e({ limit: '3' })] }, 'ungueltig', 'erzeuger.1.limit'],
        [{ an: true, erzeuger: [e({ name: 'a\0b' })] }, 'ungueltig', 'erzeuger.0.name'],
        [{ an: true, erzeuger: Array.from({ length: 11 }, () => e()) }, 'zu_viele_erzeuger', 'erzeuger'],
        [{ an: true, erzeuger: [e({ kanal: K.text })] }, 'erzeuger_unbekannt', 'erzeuger.0.kanal'],
        [{ an: true, erzeuger: [e({ kanal: K.buehne })] }, 'erzeuger_unbekannt', 'erzeuger.0.kanal'],
        [{ an: true, erzeuger: [e({ kanal: K.ohneVerschieben })] }, 'erzeuger_ohne_recht', 'erzeuger.0.kanal'],
        [{ an: true, erzeuger: [e(), e({ kanal: K.ohneKategorie }), e()] }, 'erzeuger_doppelt', 'erzeuger.2.kanal'],
        [{ an: true, erzeuger: [e({ kategorie: K.text })] }, 'kategorie_unbekannt', 'erzeuger.0.kategorie'],
        [{ an: true, erzeuger: [e({ kategorie: K.stream })] }, 'kategorie_ohne_recht', 'erzeuger.0.kategorie'],
        [{ an: true, erzeuger: [e({ kanal: K.erzeugerStream })] }, 'kategorie_ohne_recht', 'erzeuger.0.kategorie'],
        [{ an: true, erzeuger: [e({ name: ' \n ' })] }, 'name_leer', 'erzeuger.0.name'],
        [{ an: true, erzeuger: [e({ name: `${'x'.repeat(69)}{name}` })] }, 'name_zu_lang', 'erzeuger.0.name'],
        [{ an: true, erzeuger: [e({ limit: 100 })] }, 'limit_ungueltig', 'erzeuger.0.limit'],
        [{ an: true, erzeuger: [e({ limit: 1.5 })] }, 'limit_ungueltig', 'erzeuger.0.limit'],
        [{ an: true, erzeuger: [] }, 'an_ohne_erzeuger', 'an'],
      ];
      for (const [body, code, feld] of faelle) {
        const antwort = await put(kennung, body);
        assert.equal(antwort.status, 400, `${code} ${feld}`);
        assert.deepEqual(await antwort.json(), { code, feld });
      }
      assert.equal(hoechstens(`${'x'.repeat(68)}{name}`), 100);
    });

    test('ein gespeicherter Erzeuger, der nicht mehr geht, steht als fund in der Seite', async () => {
      const kennung = await sitzung();
      await speichereSprachraeume(db, SERVER, { an: true, erzeuger: [{ kanal: K.erzeuger, kategorie: K.stream, name: 'Raum', limit: 0 }] });
      assert.deepEqual((await seite(kennung))?.fund, { code: 'kategorie_ohne_recht', feld: 'erzeuger.0.kategorie' });
    });
  });
});
