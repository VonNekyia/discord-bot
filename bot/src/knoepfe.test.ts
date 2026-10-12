import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { ChannelType, Events, PermissionFlagsBits as R, type Client, type Guild, type Interaction } from 'discord.js';
import type { Pool } from 'pg';
import { migriere, oeffne, verbindung } from './datenbank.js';
import { dauer, istMenue, Knoepfe } from './knoepfe.js';
import { besitzerRechte, botRechte } from './raumrechte.js';
import {
  ANWENDUNG,
  BOT,
  discordClient,
  kanal,
  mitglied,
  mockDiscord,
  nachrichtDaten,
  rolle,
  ROLLE_BOT,
  ROLLE_TEAM,
  schliesse,
  type MockDiscord,
  type Ueberschreibung,
} from './testhilfe.js';

// Das Menü der Sprachräume: echte Interaktionen von discord.js gegen eine
// gemockte Discord-API und eine echte PostgreSQL; ohne DB_HOST übersprungen,
// in der CI immer dabei. Alle IDs sind erfunden.
// Siehe docs/entwicklung/tests.md, „Das Menü der Sprachräume“.
const ziel = verbindung();
if (!ziel && process.env.CI) throw new Error('In der CI muss die Datenbank da sein: DB_* fehlt.');

const SERVER = '300000000000000009';
const BESITZER = '200000000000000031';
const GAST = '200000000000000032';
const DRITTER = '200000000000000033';
// Ein anderer Bot im Raum, etwa für Musik.
const MUSIKBOT = '100000000000000002';
const KATEGORIE = '520000000000000001';
const RAUM = '520000000000000002';
// Ein zweiter Raum, der GAST gehören kann, und ein Sprachkanal, der kein Raum ist.
const GASTRAUM = '520000000000000003';
const FREMD = '520000000000000004';

const sieht = R.ViewChannel | R.Connect;
const botServer = R.ManageChannels | R.ManageRoles | R.MoveMembers | R.ViewChannel | R.Connect | R.SendMessages | R.ReadMessageHistory;
const eintrag = (id: string, type: number, allow: bigint, deny: bigint): Ueberschreibung => ({ id, type, allow: String(allow), deny: String(deny) });
// Die Kategorie: @everyone sieht nichts, das Team und der Bot schon.
const kategorie = [eintrag(SERVER, 0, 0n, R.ViewChannel), eintrag(ROLLE_TEAM, 0, sieht, 0n), eintrag(ROLLE_BOT, 0, sieht, 0n)];
// Der Raum, wie `eintraege` ihn anlegt.
const start = [...kategorie, eintrag(BESITZER, 1, besitzerRechte, 0n), eintrag(BOT, 1, botRechte, 0n)];
const sortiert = (liste: Ueberschreibung[] = []) => liste.toSorted((a, b) => a.id.localeCompare(b.id));

const raumDaten = (ueberschreibt: Ueberschreibung[] = start) => ({
  ...kanal(RAUM, ChannelType.GuildVoice, 'Mias Raum', 0, KATEGORIE),
  guild_id: SERVER,
  user_limit: 4,
  bitrate: 64000,
  permission_overwrites: ueberschreibt,
});

function server() {
  return {
    id: SERVER,
    name: 'Menü',
    icon: null,
    owner_id: '200000000000000099',
    member_count: 10,
    features: [],
    emojis: [],
    stickers: [],
    roles: [rolle(SERVER, '@everyone', 0n, 0), rolle(ROLLE_BOT, 'kitty', botServer, 1), rolle(ROLLE_TEAM, 'Team', 0n, 2)],
    channels: [
      { ...kanal(KATEGORIE, ChannelType.GuildCategory, 'Räume', 0, null), permission_overwrites: kategorie },
      raumDaten(),
      { ...kanal(GASTRAUM, ChannelType.GuildVoice, 'Bens Raum', 1, KATEGORIE), permission_overwrites: kategorie },
      { ...kanal(FREMD, ChannelType.GuildVoice, 'Lobby', 2, KATEGORIE), permission_overwrites: kategorie },
    ],
    members: [mitglied(BOT, [ROLLE_BOT])],
  };
}

describe('Menü der Sprachräume', { skip: ziel ? false : 'keine Datenbank, DB_HOST fehlt' }, () => {
  let db: Pool;
  let mock: MockDiscord;
  let client: Client;
  let guild: Guild;
  let knoepfe: Knoepfe;
  let zaehler = 0;

  const aktionen = () => (client as unknown as { actions: Record<'InteractionCreate' | 'ChannelUpdate', { handle(d: unknown): void }> }).actions;

  before(async () => {
    if (!ziel) return;
    await migriere(ziel, fileURLToPath(new URL('../migrationen', import.meta.url)));
    db = oeffne(ziel);
    mock = await mockDiscord();
    client = discordClient(mock, [server()]);
    guild = client.guilds.cache.get(SERVER) as Guild;
    knoepfe = new Knoepfe({ db });
  });

  beforeEach(async () => {
    if (!ziel) return;
    for (const liste of [mock.geaendert, mock.verschoben, mock.antworten, mock.anfragen]) liste.length = 0;
    mock.aendernFehler = undefined;
    mock.umbenennenWarten = undefined;
    guild.voiceStates.cache.clear();
    mock.kanaele.set(RAUM, raumDaten());
    aktionen().ChannelUpdate.handle(raumDaten());
    await db.query('DELETE FROM raeume WHERE server = $1', [SERVER]);
    await db.query('INSERT INTO raeume (kanal, server, besitzer) VALUES ($1, $2, $3)', [RAUM, SERVER, BESITZER]);
  });

  after(async () => {
    if (!ziel) return;
    await db.query('DELETE FROM raeume WHERE server = $1', [SERVER]);
    await schliesse(mock);
    await client.destroy();
    await db.end();
  });

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

  // Eine Interaktion, wie Discord sie schickt, durch die Action von discord.js.
  function interaktion(von: string, type: 3 | 5, data: object, kanalId = RAUM) {
    zaehler += 1;
    const token = `token-${zaehler}`;
    const fang: { i?: Interaction } = {};
    client.once(Events.InteractionCreate, (i) => (fang.i = i));
    aktionen().InteractionCreate.handle({
      id: String(910000000000000000n + BigInt(zaehler)),
      application_id: ANWENDUNG,
      type,
      token,
      version: 1,
      guild_id: SERVER,
      channel: { id: kanalId, type: ChannelType.GuildVoice },
      channel_id: kanalId,
      member: { ...mitglied(von, []), permissions: '0' },
      app_permissions: String(botServer),
      locale: 'de',
      guild_locale: 'de',
      entitlements: [],
      authorizing_integration_owners: { 0: SERVER },
      context: 0,
      data,
      ...(type === 3 ? { message: nachrichtDaten(kanalId, '## Dein Sprachraum') } : {}),
    });
    if (!fang.i) throw new Error('keine Interaktion');
    return { i: fang.i, token };
  }

  // Bedient eine Interaktion des Menüs und gibt die Antworten an Discord zurück.
  async function los(von: string, type: 3 | 5, data: object, kanalId = RAUM) {
    const { i, token } = interaktion(von, type, data, kanalId);
    assert.ok(istMenue(i));
    await knoepfe.bediene(i);
    return mock.antworten.filter((a) => a.token === token);
  }
  const drueckt = (von: string, aktion: string, kanalId = RAUM) => los(von, 3, { custom_id: `sprachraum:${aktion}`, component_type: 2 }, kanalId);
  const waehlt = (von: string, aktion: string, wen: string, bot = false) =>
    los(von, 3, {
      custom_id: `sprachraum:${aktion}`,
      component_type: 5,
      values: [wen],
      resolved: { users: { [wen]: { ...mitglied(wen, []).user, bot } }, members: { [wen]: { roles: [], joined_at: '2026-01-01T00:00:00.000Z', permissions: '0', flags: 0 } } },
    });
  const schickt = (von: string, aktion: string, wert: string) =>
    los(von, 5, { custom_id: `sprachraum:${aktion}`, components: [{ type: 18, id: 1, component: { type: 4, id: 2, custom_id: 'wert', value: wert } }] });

  const text = (antworten: MockDiscord['antworten']) => antworten.at(-1)?.daten.content;
  // Text, Knöpfe und Erwähnungen der letzten Antwort.
  const wichtig = (antworten: MockDiscord['antworten']) => {
    const d = antworten.at(-1)?.daten as { content?: string; components?: unknown; allowed_mentions?: unknown } | undefined;
    return { content: d?.content, components: d?.components, allowed_mentions: d?.allowed_mentions };
  };
  const besitzer = async () => (await db.query('SELECT besitzer FROM raeume WHERE kanal = $1', [RAUM])).rows[0]?.besitzer;
  const nurBesitzer = `Das darf nur der Besitzer: <@${BESITZER}>.`;
  // Der Raum, wie ihn der letzte PATCH hinterlassen hat.
  const ueberschreibt = () => sortiert(mock.geaendert.at(-1)?.body.permission_overwrites);
  const gesperrt = [
    eintrag(SERVER, 0, 0n, R.ViewChannel | R.Connect),
    eintrag(ROLLE_TEAM, 0, R.ViewChannel, R.Connect),
    eintrag(ROLLE_BOT, 0, R.ViewChannel, R.Connect),
    eintrag(BESITZER, 1, besitzerRechte, 0n),
    eintrag(BOT, 1, botRechte, 0n),
  ];

  test('Sperren: deferReply vor dem PATCH, alle Einträge in einem PATCH ohne Namen, wer drin ist, bekommt Verbinden', async () => {
    stimme(BESITZER, RAUM);
    stimme(GAST, RAUM);
    const antworten = await drueckt(BESITZER, 'sperren');
    assert.deepEqual([antworten[0]?.typ, antworten[0]?.daten.flags], [5, 64]);
    assert.equal(mock.geaendert.length, 1);
    assert.deepEqual(Object.keys(mock.geaendert[0]?.body ?? {}), ['permission_overwrites']);
    assert.equal(mock.geaendert[0]?.grund, 'Sprachraum: gesperrt');
    assert.deepEqual(ueberschreibt(), sortiert([...gesperrt, eintrag(GAST, 1, R.Connect, 0n)]));
    assert.equal(text(antworten), 'Gesperrt. Wer gerade drin ist, kommt auch nach dem Gehen wieder hinein.');
    const pfade = mock.anfragen.map((a) => `${a.methode} ${a.pfad}`);
    const rueckruf = pfade.findIndex((p) => p.includes('/callback'));
    assert.ok(rueckruf >= 0 && rueckruf < pfade.indexOf(`PATCH /api/v10/channels/${RAUM}`));
  });

  test('Sperren: wer nicht Besitzer ist, bekommt den Hinweis mit dem Besitzer; ein gesperrter Raum bleibt, wie er ist', async () => {
    const antworten = await drueckt(GAST, 'sperren');
    assert.equal(text(antworten), nurBesitzer);
    assert.deepEqual(wichtig(antworten), { content: nurBesitzer, components: [], allowed_mentions: { parse: [] } });
    aktionen().ChannelUpdate.handle(raumDaten(gesperrt));
    assert.equal(text(await drueckt(BESITZER, 'sperren')), 'Der Raum ist schon gesperrt.');
    assert.equal(mock.geaendert.length, 0);
  });

  test('Entsperren: Verbinden wieder wie in der Kategorie, die eigenen Rechte gehen weg; Hinweise', async () => {
    assert.equal(text(await drueckt(BESITZER, 'entsperren')), 'Der Raum ist nicht gesperrt.');
    aktionen().ChannelUpdate.handle(raumDaten([...gesperrt, eintrag(GAST, 1, R.Connect, 0n)]));
    assert.equal(text(await drueckt(GAST, 'entsperren')), nurBesitzer);
    assert.equal(mock.geaendert.length, 0);
    const antworten = await drueckt(BESITZER, 'entsperren');
    assert.deepEqual(ueberschreibt(), sortiert(start));
    assert.equal(mock.geaendert[0]?.grund, 'Sprachraum: entsperrt');
    assert.equal(text(antworten), 'Entsperrt. Beitreten darf wieder, wer die Kategorie betreten darf.');
  });

  test('Verstecken und Zeigen: wer drin ist, sieht den Raum weiter; Zeigen stellt die Kategorie wieder her', async () => {
    stimme(GAST, RAUM);
    assert.equal(text(await drueckt(GAST, 'verstecken')), nurBesitzer);
    assert.equal(text(await drueckt(BESITZER, 'zeigen')), 'Der Raum ist nicht versteckt.');
    assert.equal(text(await drueckt(BESITZER, 'verstecken')), 'Versteckt. Wer gerade drin ist, sieht den Raum weiter.');
    assert.equal(mock.geaendert[0]?.grund, 'Sprachraum: versteckt');
    assert.deepEqual(
      ueberschreibt(),
      sortiert([
        eintrag(SERVER, 0, 0n, R.ViewChannel),
        eintrag(ROLLE_TEAM, 0, R.Connect, R.ViewChannel),
        eintrag(ROLLE_BOT, 0, R.Connect, R.ViewChannel),
        eintrag(BESITZER, 1, besitzerRechte, 0n),
        eintrag(BOT, 1, botRechte, 0n),
        eintrag(GAST, 1, sieht, 0n),
      ]),
    );
    assert.equal(text(await drueckt(BESITZER, 'verstecken')), 'Der Raum ist schon versteckt.');
    assert.equal(text(await drueckt(GAST, 'zeigen')), nurBesitzer);
    assert.equal(text(await drueckt(BESITZER, 'zeigen')), 'Wieder sichtbar für alle, die die Kategorie sehen.');
    assert.equal(mock.geaendert.at(-1)?.grund, 'Sprachraum: gezeigt');
    assert.deepEqual(ueberschreibt(), sortiert(start));
  });

  test('Umbenennen: ein Formular mit dem Namen von jetzt für den Besitzer, für andere der Hinweis', async () => {
    const formular = await drueckt(BESITZER, 'umbenennen');
    assert.equal(formular.length, 1);
    assert.equal(formular[0]?.typ, 9);
    assert.equal(formular[0]?.daten.custom_id, 'sprachraum:umbenennen');
    const feld = formular[0]?.daten.components?.[0];
    assert.equal(feld?.type, 18);
    assert.deepEqual(feld?.component, { type: 4, custom_id: 'wert', style: 1, required: true, min_length: 1, max_length: 100, value: 'Mias Raum' });
    const hinweis = await drueckt(GAST, 'umbenennen');
    assert.deepEqual([hinweis[0]?.typ, hinweis[0]?.daten.flags, hinweis[0]?.daten.content], [4, 64, nurBesitzer]);
  });

  test('Umbenennen: das Formular setzt den Namen, ohne Platzhalter; ein leerer Name gibt einen Hinweis', async () => {
    const antworten = await schickt(BESITZER, 'umbenennen', '  {name} Lounge ');
    assert.deepEqual([antworten[0]?.typ, antworten[0]?.daten.flags], [5, 64]);
    assert.deepEqual(mock.geaendert, [{ kanal: RAUM, body: { name: '{name} Lounge' }, grund: 'Sprachraum: umbenannt' }]);
    assert.equal(text(antworten), 'Umbenannt.');
    assert.equal(guild.channels.cache.get(RAUM)?.name, '{name} Lounge');
    assert.equal(text(await schickt(BESITZER, 'umbenennen', '   ')), 'Ein Name hat 1 bis 100 Zeichen.');
    assert.equal(text(await schickt(GAST, 'umbenennen', 'Meins')), nurBesitzer);
    assert.equal(mock.geaendert.length, 1);
  });

  test('Umbenennen bei 429: der Bot wartet nicht, sondern nennt die Wartezeit', async () => {
    mock.umbenennenWarten = 300;
    const los = Date.now();
    const antworten = await schickt(BESITZER, 'umbenennen', 'Später');
    assert.ok(Date.now() - los < 2_000);
    assert.equal(text(antworten), 'Discord lässt den Raum erst in 5 min wieder umbenennen.');
    assert.equal(mock.geaendert.length, 1);
  });

  test('Limit: ein Formular mit dem Limit von jetzt; 7 setzt es, 0 heisst unbegrenzt, anderes gibt einen Hinweis', async () => {
    const formular = await drueckt(BESITZER, 'limit');
    assert.equal(formular[0]?.typ, 9);
    assert.deepEqual(formular[0]?.daten.components?.[0]?.component, { type: 4, custom_id: 'wert', style: 1, required: true, min_length: 1, max_length: 2, value: '4' });
    assert.equal(text(await drueckt(GAST, 'limit')), nurBesitzer);
    assert.equal(text(await schickt(BESITZER, 'limit', '7')), 'Das Limit ist jetzt 7.');
    assert.deepEqual(mock.geaendert.at(-1), { kanal: RAUM, body: { user_limit: 7 }, grund: 'Sprachraum: Limit geändert' });
    assert.equal(text(await schickt(BESITZER, 'limit', '0')), 'Der Raum hat kein Limit mehr.');
    assert.deepEqual(mock.geaendert.at(-1)?.body, { user_limit: 0 });
    assert.equal(text(await schickt(BESITZER, 'limit', 'zehn')), 'Das Limit ist eine Zahl von 0 bis 99.');
    assert.equal(text(await schickt(GAST, 'limit', '5')), nurBesitzer);
    assert.equal(mock.geaendert.length, 2);
  });

  test('Rauswerfen: die Nutzerauswahl nur für den Besitzer; trennt, wer drin ist; Hinweise für alle anderen', async () => {
    const auswahl = await drueckt(BESITZER, 'rauswerfen');
    assert.deepEqual([auswahl[0]?.typ, auswahl[0]?.daten.flags], [4, 64]);
    assert.deepEqual(auswahl[0]?.daten.components?.[0]?.components?.[0], {
      type: 5,
      custom_id: 'sprachraum:rauswerfen',
      placeholder: 'Mitglied wählen',
      min_values: 1,
      max_values: 1,
    });
    assert.equal(text(await drueckt(GAST, 'rauswerfen')), nurBesitzer);

    stimme(GAST, RAUM);
    const antworten = await waehlt(BESITZER, 'rauswerfen', GAST);
    assert.equal(antworten[0]?.typ, 6);
    assert.deepEqual(wichtig(antworten), { content: `<@${GAST}> ist raus.`, components: [], allowed_mentions: { parse: [] } });
    assert.deepEqual(mock.verschoben, [{ nutzer: GAST, kanal: null, grund: 'Sprachraum: rausgeworfen' }]);
    assert.equal(text(await waehlt(BESITZER, 'rauswerfen', DRITTER)), `<@${DRITTER}> ist nicht im Raum.`);
    assert.equal(text(await waehlt(BESITZER, 'rauswerfen', BESITZER)), 'Dich selbst kannst du nicht rauswerfen.');
    assert.equal(text(await waehlt(BESITZER, 'rauswerfen', BOT)), 'Den Bot kannst du nicht rauswerfen.');
    assert.equal(text(await waehlt(GAST, 'rauswerfen', DRITTER)), nurBesitzer);
    assert.equal(mock.verschoben.length, 1);
  });

  test('Bannen: Sehen und Verbinden verboten, erst die Rechte, dann trennen; zweimal gibt einen Hinweis', async () => {
    stimme(GAST, RAUM);
    const antworten = await waehlt(BESITZER, 'bannen', GAST);
    assert.equal(text(antworten), `<@${GAST}> ist gebannt.`);
    assert.deepEqual(ueberschreibt(), sortiert([...start, eintrag(GAST, 1, 0n, R.ViewChannel | R.Connect)]));
    assert.equal(mock.geaendert[0]?.grund, 'Sprachraum: gebannt');
    assert.deepEqual(mock.verschoben, [{ nutzer: GAST, kanal: null, grund: 'Sprachraum: gebannt' }]);
    const pfade = mock.anfragen.map((a) => `${a.methode} ${a.pfad}`);
    assert.ok(pfade.indexOf(`PATCH /api/v10/channels/${RAUM}`) < pfade.indexOf(`PATCH /api/v10/guilds/${SERVER}/members/${GAST}`));
    assert.equal(text(await waehlt(BESITZER, 'bannen', GAST)), `<@${GAST}> ist schon gebannt.`);
    assert.equal(text(await waehlt(BESITZER, 'bannen', BESITZER)), 'Dich selbst kannst du nicht bannen.');
    assert.equal(text(await waehlt(BESITZER, 'bannen', BOT)), 'Den Bot kannst du nicht bannen.');
    assert.equal(mock.geaendert.length, 1);
  });

  test('Bannen bei 30060: ein Hinweis, niemand wird getrennt, keine Logzeile', async (t) => {
    const log = t.mock.method(console, 'error', () => {});
    stimme(GAST, RAUM);
    mock.aendernFehler = [400, 30060];
    assert.equal(text(await waehlt(BESITZER, 'bannen', GAST)), 'Der Raum hat so viele Rechte-Einträge, dass Discord keinen weiteren nimmt.');
    assert.deepEqual(mock.verschoben, []);
    assert.equal(log.mock.callCount(), 0);
  });

  test('Entbannen: hebt den Bann auf, der Eintrag geht weg; wer nicht gebannt ist, bekommt einen Hinweis', async () => {
    aktionen().ChannelUpdate.handle(raumDaten([...start, eintrag(GAST, 1, 0n, R.ViewChannel | R.Connect)]));
    assert.equal(text(await waehlt(BESITZER, 'entbannen', DRITTER)), `<@${DRITTER}> ist nicht gebannt.`);
    assert.equal(text(await waehlt(GAST, 'entbannen', GAST)), nurBesitzer);
    assert.equal(text(await waehlt(BESITZER, 'entbannen', GAST)), `<@${GAST}> ist nicht mehr gebannt.`);
    assert.deepEqual(ueberschreibt(), sortiert(start));
    assert.equal(mock.geaendert[0]?.grund, 'Sprachraum: entbannt');
    assert.equal(mock.geaendert.length, 1);
  });

  test('Besitz übergeben: an ein Mitglied im Raum ohne eigenen Raum; danach darf nur es die Knöpfe', async () => {
    stimme(BESITZER, RAUM);
    stimme(GAST, RAUM);
    assert.equal(text(await waehlt(BESITZER, 'uebergeben', GAST)), `<@${GAST}> ist jetzt Besitzer.`);
    assert.equal(await besitzer(), GAST);
    assert.deepEqual(ueberschreibt(), sortiert([...start, eintrag(GAST, 1, besitzerRechte, 0n)]));
    assert.equal(mock.geaendert[0]?.grund, 'Sprachraum: Besitz übergeben');
    assert.equal(text(await drueckt(BESITZER, 'sperren')), `Das darf nur der Besitzer: <@${GAST}>.`);
  });

  test('Besitz übergeben: nicht im Raum, schon ein eigener Raum, sich selbst, der Bot: Hinweise, der Besitz bleibt', async () => {
    stimme(GAST, RAUM);
    assert.equal(text(await waehlt(BESITZER, 'uebergeben', DRITTER)), `<@${DRITTER}> ist nicht im Raum.`);
    assert.equal(text(await waehlt(BESITZER, 'uebergeben', BESITZER)), 'Dich selbst kannst du nicht zum Besitzer machen.');
    assert.equal(text(await waehlt(BESITZER, 'uebergeben', BOT)), 'Den Bot kannst du nicht zum Besitzer machen.');
    assert.equal(text(await waehlt(GAST, 'uebergeben', GAST)), nurBesitzer);
    await db.query('INSERT INTO raeume (kanal, server, besitzer) VALUES ($1, $2, $3)', [GASTRAUM, SERVER, GAST]);
    assert.equal(text(await waehlt(BESITZER, 'uebergeben', GAST)), `<@${GAST}> hat schon einen eigenen Raum.`);
    assert.equal(await besitzer(), BESITZER);
    assert.equal(mock.geaendert.length, 0);
  });

  test('Besitz übergeben: kein anderer Bot wird Besitzer; Rauswerfen trifft ihn weiter', async () => {
    stimme(BESITZER, RAUM);
    stimme(MUSIKBOT, RAUM);
    assert.equal(text(await waehlt(BESITZER, 'uebergeben', MUSIKBOT, true)), 'Einem Bot kannst du den Raum nicht übergeben.');
    assert.equal(await besitzer(), BESITZER);
    assert.equal(mock.geaendert.length, 0);
    assert.equal(text(await waehlt(BESITZER, 'rauswerfen', MUSIKBOT, true)), `<@${MUSIKBOT}> ist raus.`);
    assert.deepEqual(mock.verschoben, [{ nutzer: MUSIKBOT, kanal: null, grund: 'Sprachraum: rausgeworfen' }]);
  });

  test('Übernehmen: wer im Raum ist und keinen Raum hat, wird Besitzer, wenn der Besitzer nicht drin ist', async () => {
    stimme(GAST, RAUM);
    const antworten = await drueckt(GAST, 'uebernehmen');
    assert.deepEqual([antworten[0]?.typ, antworten[0]?.daten.flags], [5, 64]);
    assert.equal(text(antworten), 'Der Raum gehört jetzt dir.');
    assert.equal(await besitzer(), GAST);
    assert.deepEqual(ueberschreibt(), sortiert([...start, eintrag(GAST, 1, besitzerRechte, 0n)]));
    assert.equal(mock.geaendert[0]?.grund, 'Sprachraum: übernommen');
  });

  test('Übernehmen: Hinweise, wenn der Besitzer drin ist, man selbst nicht, man schon Besitzer ist oder einen Raum hat', async () => {
    stimme(BESITZER, RAUM);
    stimme(GAST, RAUM);
    assert.equal(text(await drueckt(GAST, 'uebernehmen')), `Der Besitzer ist im Raum: <@${BESITZER}>.`);
    assert.equal(text(await drueckt(DRITTER, 'uebernehmen')), 'Übernehmen kann nur, wer im Raum ist.');
    assert.equal(text(await drueckt(BESITZER, 'uebernehmen')), 'Der Raum gehört dir schon.');
    stimme(BESITZER, null);
    await db.query('INSERT INTO raeume (kanal, server, besitzer) VALUES ($1, $2, $3)', [GASTRAUM, SERVER, GAST]);
    assert.equal(text(await drueckt(GAST, 'uebernehmen')), 'Du hast schon einen eigenen Raum.');
    assert.equal(await besitzer(), BESITZER);
    assert.equal(mock.geaendert.length, 0);
  });

  test('Info: für jeden, der den Chat sieht; Besitzer, Limit, gesperrt, versteckt, Gebannte', async () => {
    assert.equal(text(await drueckt(DRITTER, 'info')), [`Besitzer: <@${BESITZER}>`, 'Limit: 4', 'Gesperrt: nein', 'Versteckt: nein', 'Gebannt: 0'].join('\n'));
    aktionen().ChannelUpdate.handle({ ...raumDaten([...gesperrt, eintrag(GAST, 1, 0n, R.ViewChannel | R.Connect)]), user_limit: 0 });
    assert.equal(text(await drueckt(DRITTER, 'info')), [`Besitzer: <@${BESITZER}>`, 'Limit: keins', 'Gesperrt: ja', 'Versteckt: nein', 'Gebannt: 1'].join('\n'));
    assert.equal(mock.geaendert.length, 0);
  });

  test('ein Knopf in einem Kanal, der kein Raum ist, sagt das', async () => {
    assert.equal(text(await drueckt(BESITZER, 'sperren', FREMD)), 'Das ist kein Sprachraum mehr.');
    assert.equal(text(await drueckt(BESITZER, 'rauswerfen', FREMD)), 'Das ist kein Sprachraum mehr.');
    assert.equal(mock.geaendert.length, 0);
  });

  test('istMenue erkennt nur das Präfix; einen unbekannten Knopf mit Präfix sagt der Bot an', async () => {
    assert.equal(istMenue(interaktion(BESITZER, 3, { custom_id: 'anderes:sperren', component_type: 2 }).i), false);
    assert.equal(text(await drueckt(BESITZER, 'gibt-es-nicht')), 'Diesen Knopf kennt der Bot nicht.');
  });

  test('fehlt dem Bot ein Recht (50013), sagt er es; eine Logzeile ohne IDs', async (t) => {
    const log = t.mock.method(console, 'error', () => {});
    mock.aendernFehler = [403, 50013];
    assert.equal(text(await drueckt(BESITZER, 'sperren')), 'Dem Bot fehlt dafür ein Recht. Sag dem Team Bescheid.');
    assert.equal(log.mock.callCount(), 1);
    assert.doesNotMatch(String(log.mock.calls[0]?.arguments[0]), /\d{17,}|token/);
  });

  test('ein anderer Fehler: „Das hat nicht geklappt.“ und eine Logzeile ohne IDs und Token', async (t) => {
    const log = t.mock.method(console, 'error', () => {});
    mock.aendernFehler = [500, 0];
    assert.equal(text(await drueckt(BESITZER, 'sperren')), 'Das hat nicht geklappt.');
    assert.equal(log.mock.callCount(), 1);
    assert.match(String(log.mock.calls[0]?.arguments[0]), /^Sprachraum-Menü: /);
    assert.doesNotMatch(String(log.mock.calls[0]?.arguments[0]), /\d{17,}|token/);
  });
});

test('dauer: Sekunden unter einer Minute, sonst angefangene Minuten; die 50 ms von offset zählen nicht', () => {
  assert.equal(dauer(50), '1 s');
  assert.equal(dauer(12_050), '12 s');
  assert.equal(dauer(300_050), '5 min');
  assert.equal(dauer(301_050), '6 min');
});
