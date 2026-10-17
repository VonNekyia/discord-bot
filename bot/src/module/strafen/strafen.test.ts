import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';
import type { Ziel } from '../../discord/befehle.js';
import { DiscordFehler } from '../../discord/fehler.js';
import type { Druck } from '../../discord/interaktionen.js';
import type { Formular } from '../../discord/menue.js';
import type { Person, Rang } from '../../discord/mitglieder.js';
import type { Server } from '../../discord/server.js';
import type { Kontext } from '../../discord/kontext.js';
import { BausteinFehler } from '../../kern/baukasten.js';
import { migriere, oeffne, verbindung } from '../../kern/datenbank.js';
import { falscherAufruf } from '../../testhilfe.js';
import { raeumeStrafenAuf, Strafbefehle, type Werkzeuge } from './befehle.js';
import { strafenBereich } from './seiten.js';
import { bannDm, hoechstens, liesStrafen, ohneEinstellung, pruefe, speichereStrafen, type Strafen } from './strafen.js';

// Die Managed Commands ohne Discord: Werkzeuge, die aufschreiben, und eine
// echte PostgreSQL. Alle IDs sind erfunden.
// Siehe docs/benutzung/managed-commands.md und docs/schnittstelle/strafen.md.
const ziel = verbindung();
const SERVER = '300000000000000111';
const ANDERER = '300000000000000112';
const MOD = '200000000000000111';
const OPFER = '200000000000000112';
const BOT = '100000000000000001';
const R_MOD = '400000000000000111';
const R_STARK = '400000000000000112';
const R_LEER = '400000000000000113';

const server = { id: SERVER, name: 'Probe' } as unknown as Server;
const person = (id: string, name = `nutzer-${id.slice(-2)}`): Person => ({ id, name, benutzername: name, bot: false });
const rang = (hoechste: number, rollen: string[] = [], mehr: Partial<Rang> = {}): Rang => ({ eigentuemer: false, admin: false, rollen, hoechste, ...mehr });

test('pruefe: jede Regel mit ihrem Code und Feld, in der Reihenfolge des Vertrags', () => {
  const rollen = new Set([R_MOD, R_STARK]);
  const gut = (): Record<string, unknown> => ({ ...ohneEinstellung(), gruende: [{ text: ' Spam ' }], limits: [{ rolle: R_MOD, bans: 1, kicks: 2 }] });
  const mit = (aenderung: Record<string, unknown>) => pruefe({ ...gut(), ...aenderung }, rollen);
  assert.deepEqual(pruefe(gut(), rollen), { strafen: { ...ohneEinstellung(), gruende: [{ text: 'Spam' }], limits: [{ rolle: R_MOD, bans: 1, kicks: 2 }] } });
  const faelle: [unknown, string, string][] = [
    [[], 'ungueltig', 'gruende'],
    [{ ...gut(), gruende: 'x' }, 'ungueltig', 'gruende'],
    [{ ...gut(), gruende: [{ text: 'a\0' }] }, 'ungueltig', 'gruende.0.text'],
    [{ ...gut(), limits: [{ rolle: null, bans: 1, kicks: 1 }] }, 'ungueltig', 'limits.0.rolle'],
    [{ ...gut(), verwarnungTage: '365' }, 'ungueltig', 'verwarnungTage'],
    [{ ...gut(), gruende: Array.from({ length: 25 }, (_, i) => ({ text: `g${i}` })) }, 'zu_viele_gruende', 'gruende'],
    [{ ...gut(), gruende: [{ text: 'a' }, { text: '  ' }] }, 'grund_leer', 'gruende.1.text'],
    [{ ...gut(), gruende: [{ text: 'x'.repeat(101) }] }, 'grund_zu_lang', 'gruende.0.text'],
    [{ ...gut(), gruende: [{ text: 'Custom' }] }, 'grund_reserviert', 'gruende.0.text'],
    [{ ...gut(), gruende: [{ text: 'Spam' }, { text: 'spam' }] }, 'grund_doppelt', 'gruende.1.text'],
    [{ ...gut(), limits: Array.from({ length: 26 }, () => ({ rolle: R_MOD, bans: 1, kicks: 1 })) }, 'zu_viele_limits', 'limits'],
    [{ ...gut(), limits: [{ rolle: R_LEER, bans: 1, kicks: 1 }] }, 'rolle_unbekannt', 'limits.0.rolle'],
    [{ ...gut(), limits: [{ rolle: R_MOD, bans: 1, kicks: 1 }, { rolle: R_MOD, bans: 1, kicks: 1 }] }, 'rolle_doppelt', 'limits.1.rolle'],
    [{ ...gut(), limits: [{ rolle: R_MOD, bans: 1.5, kicks: 1 }] }, 'limit_ungueltig', 'limits.0.bans'],
    [{ ...gut(), limits: [{ rolle: R_MOD, bans: 1, kicks: 101 }] }, 'limit_ungueltig', 'limits.0.kicks'],
    [{ ...gut(), dmText: `${'x'.repeat(1001)}{grund}` }, 'dm_zu_lang', 'dmText'],
    [{ ...gut(), entbannung: 'x'.repeat(501) }, 'entbannung_zu_lang', 'entbannung'],
    [{ ...gut(), verwarnungTage: 29 }, 'verwarnung_tage_ungueltig', 'verwarnungTage'],
    [{ ...gut(), verwarnungTage: 731 }, 'verwarnung_tage_ungueltig', 'verwarnungTage'],
    [{ ...gut(), dm: true, dmText: ' ' }, 'dm_ohne_text', 'dm'],
  ];
  for (const [eingabe, code, feld] of faelle) assert.deepEqual(pruefe(eingabe, rollen), { code, feld }, `${code} ${feld}`);
  assert.deepEqual(mit({ dm: false, dmText: '' }), { strafen: { ...ohneEinstellung(), gruende: [{ text: 'Spam' }], limits: [{ rolle: R_MOD, bans: 1, kicks: 2 }], dm: false, dmText: '' } });
});

test('Länge der DM: {server} mit 100, {grund} mit 400 Zeichen; 1400 und 500 bleiben unter 2000', () => {
  assert.equal(hoechstens('{server}: {grund}'), 502);
  const s: Strafen = { ...ohneEinstellung(), dmText: 'Gebannt von {server}. Grund: {grund}', entbannung: 'Schreib an das Team.' };
  assert.equal(bannDm(s, 'Probe', 'Spam'), 'Gebannt von Probe. Grund: Spam\n\nSchreib an das Team.');
  assert.equal(bannDm({ ...s, entbannung: ' ' }, 'Probe', 'Spam'), 'Gebannt von Probe. Grund: Spam');
  // Ein Durchgang: Platzhalter im Grund oder im Namen bleiben stehen.
  assert.equal(bannDm({ ...s, entbannung: '' }, 'Server {grund}', 'Wer {server} schreibt'), 'Gebannt von Server {grund}. Grund: Wer {server} schreibt');
  assert.ok(1400 + 2 + 500 <= 2000);
});

describe('Managed Commands', { skip: ziel ? false : 'keine Datenbank, DB_HOST fehlt' }, () => {
  let db: Pool;
  let jetzt = Date.parse('2026-10-17T12:00:00Z');
  // Was die falschen Werkzeuge getan haben, der Reihe nach.
  const getan: string[] = [];
  const ziele = new Map<string, Ziel>();
  let bot = { id: BOT, rang: rang(10, ['400000000000000001']), bannen: true, kicken: true };
  let fehler: { dm?: Error; banne?: Error } = {};
  // So viele ms braucht ein Bann; damit zwei Befehle sich überschneiden.
  let bannDauer = 0;
  const w: Werkzeuge = {
    zielAuf: async (_s, id) => ziele.get(id),
    botAuf: () => bot,
    banne: async (_s, id, grund) => {
      if (bannDauer > 0) await new Promise((fertig) => setTimeout(fertig, bannDauer));
      if (fehler.banne) throw fehler.banne;
      getan.push(`ban ${id} ${grund}`);
    },
    kicke: async (_s, id, grund) => void getan.push(`kick ${id} ${grund}`),
    schreibe: async (_s, id, inhalt) => {
      if (fehler.dm) throw fehler.dm;
      getan.push(`dm ${id} ${inhalt}`);
    },
  };
  let befehle: Strafbefehle;
  let einstellung: Strafen;

  before(async () => {
    if (!ziel) return;
    await migriere(ziel, fileURLToPath(new URL('../../../migrationen', import.meta.url)));
    db = oeffne(ziel);
  });

  after(async () => {
    if (!ziel) return;
    for (const t of ['strafen', 'strafaktionen', 'verwarnungen']) await db.query(`DELETE FROM ${t} WHERE server = ANY($1)`, [[SERVER, ANDERER]]);
    await db.end();
  });

  beforeEach(async () => {
    for (const t of ['strafen', 'strafaktionen', 'verwarnungen']) await db.query(`DELETE FROM ${t} WHERE server = ANY($1)`, [[SERVER, ANDERER]]);
    getan.length = 0;
    fehler = {};
    bannDauer = 0;
    jetzt = Date.parse('2026-10-17T12:00:00Z');
    bot = { id: BOT, rang: rang(10, ['400000000000000001']), bannen: true, kicken: true };
    einstellung = {
      ...ohneEinstellung(),
      gruende: [{ text: 'Spam' }, { text: 'Beleidigung' }, { text: 'Werbung für Spam' }],
      limits: [
        { rolle: R_MOD, bans: 1, kicks: 2 },
        { rolle: R_STARK, bans: 3, kicks: 0 },
      ],
      entbannung: 'Schreib an das Team.',
    };
    ziele.set(OPFER, { person: person(OPFER), rang: rang(1) });
    befehle = new Strafbefehle({ db, einstellungen: { fetch: async () => einstellung }, w, uhr: () => jetzt });
  });

  // Ein Fall mit einer Rolle aus der Liste, wie /ban ihn baut.
  const fall = (art: 'ban' | 'kick' | 'warn', mehr: { rang?: Rang; ziel?: Ziel; grund?: string } = {}) =>
    befehle.fuehreAus({
      art,
      server,
      wer: person(MOD, 'Moderator'),
      rang: mehr.rang ?? rang(5, [R_MOD]),
      ziel: mehr.ziel ?? { person: person(OPFER), rang: rang(1) },
      grund: mehr.grund ?? 'Spam',
    });

  test('Vorschläge: die Gründe mit dem Text, dahinter „Eigener Grund …“ mit custom; höchstens 24 Gründe', async () => {
    assert.deepEqual(await befehle.vorschlaege('spam', server), [
      { name: 'Spam', wert: 'Spam' },
      { name: 'Werbung für Spam', wert: 'Werbung für Spam' },
      { name: 'Eigener Grund …', wert: 'custom' },
    ]);
    einstellung = { ...einstellung, gruende: Array.from({ length: 30 }, (_, i) => ({ text: `g${i}` })) };
    const alle = await befehle.vorschlaege('', server);
    assert.equal(alle.length, 25);
    assert.equal(alle.at(-1)?.wert, 'custom');
  });

  test('ohne Rolle aus der Liste nein; Eigentümer und Administratoren ohne Limit', async () => {
    assert.equal(await fall('ban', { rang: rang(5, [R_LEER]) }), 'Du darfst diesen Befehl hier nicht nutzen.');
    assert.equal(await fall('warn', { rang: rang(5) }), 'Du darfst diesen Befehl hier nicht nutzen.');
    assert.equal(getan.length, 0);
    for (let i = 0; i < 3; i++) assert.equal(await fall('ban', { rang: rang(5, [], { admin: true }) }), 'nutzer-12 ist gebannt. Grund: Spam. Die DM ist angekommen.');
    assert.equal(getan.filter((g) => g.startsWith('ban')).length, 3);
  });

  test('Bann: erst die DM mit Text und Entbannung, dann der Bann mit Grund im Audit-Log; das Limit zählt', async () => {
    assert.equal(await fall('ban'), 'nutzer-12 ist gebannt. Grund: Spam. Die DM ist angekommen. Bans in 7 Tagen: 1 von 1.');
    assert.deepEqual(getan, [`dm ${OPFER} Du wurdest von Probe gebannt. Grund: Spam\n\nSchreib an das Team.`, `ban ${OPFER} Spam · /ban von Moderator`]);
  });

  test('das Limit: das höchste der Rollen, rollierend 7 Tage, mit der Zeit des nächsten; 0 heisst nie', async () => {
    const beide = rang(5, [R_MOD, R_STARK]);
    for (let i = 1; i <= 3; i++) {
      jetzt += 60_000;
      assert.match(await fall('ban', { rang: beide }), new RegExp(`Bans in 7 Tagen: ${i} von 3\\.$`));
    }
    const ersterBann = Date.parse('2026-10-17T12:01:00Z');
    assert.equal(
      await fall('ban', { rang: beide }),
      `Du hast dein Limit erreicht: 3 Bans in 7 Tagen. Der nächste geht ab <t:${(ersterBann + 7 * 86_400_000) / 1000}:R>.`,
    );
    // 1 ms vor 7 Tagen nach dem ersten zählt er noch, genau 7 Tage danach nicht mehr.
    jetzt = ersterBann + 7 * 86_400_000 - 1;
    assert.match(await fall('ban', { rang: beide }), /^Du hast dein Limit erreicht: 3 Bans in 7 Tagen\./);
    jetzt = ersterBann + 7 * 86_400_000;
    assert.match(await fall('ban', { rang: beide }), /Bans in 7 Tagen: 3 von 3\.$/);
    // Kicks zählen getrennt; das höchste Limit der beiden Rollen ist 2.
    assert.match(await fall('kick', { rang: beide }), /Kicks in 7 Tagen: 1 von 2\.$/);
    assert.equal(await fall('kick', { rang: rang(5, [R_STARK]) }), 'Deine Rollen dürfen nicht kicken.');
  });

  test('zwei Befehle zugleich kommen nicht am Limit vorbei', async () => {
    // Der erste Bann dauert; ohne die Sperre zählten beide vor dem ersten Eintrag.
    bannDauer = 50;
    const [eins, zwei] = await Promise.all([fall('ban'), fall('ban')]);
    assert.deepEqual([eins, zwei].map((x) => x.startsWith('Du hast dein Limit erreicht')).toSorted(), [false, true]);
    assert.equal(getan.filter((g) => g.startsWith('ban')).length, 1);
  });

  test('Ziel: man selbst, der Bot, der Eigentümer, kein Mitglied bei Kick und Warn, Hierarchie von Nutzer und Bot', async () => {
    const opfer = (r?: Rang): Ziel => ({ person: person(OPFER), ...(r ? { rang: r } : {}) });
    assert.equal(await fall('ban', { ziel: { person: person(MOD), rang: rang(1) } }), 'Dich selbst kannst du nicht treffen.');
    assert.equal(await fall('kick', { ziel: { person: person(BOT), rang: rang(1) } }), 'kitty kann sich nicht selbst treffen.');
    assert.equal(await fall('ban', { ziel: opfer(rang(9, [], { eigentuemer: true })) }), 'Den Eigentümer des Servers kann niemand treffen.');
    assert.equal(await fall('kick', { ziel: opfer() }), 'nutzer-12 ist nicht auf dem Server.');
    assert.equal(await fall('warn', { ziel: opfer() }), 'nutzer-12 ist nicht auf dem Server.');
    assert.equal(await fall('ban', { ziel: opfer(rang(5)) }), 'nutzer-12 steht so hoch wie du oder höher.');
    assert.equal(await fall('ban', { ziel: opfer(rang(10)), rang: rang(12, [R_MOD]) }), 'Die Rolle von kitty steht nicht über nutzer-12.');
    // Der Eigentümer darf über jeder Rolle; die Regel für den Bot bleibt.
    assert.equal(await fall('ban', { ziel: opfer(rang(10)), rang: rang(0, [], { eigentuemer: true }) }), 'Die Rolle von kitty steht nicht über nutzer-12.');
    assert.deepEqual(getan, []);
    // Wer nicht auf dem Server ist, lässt sich bannen, ohne DM.
    assert.equal(await fall('ban', { ziel: opfer() }), 'nutzer-12 ist gebannt. Grund: Spam. Bans in 7 Tagen: 1 von 1.');
    assert.deepEqual(getan, [`ban ${OPFER} Spam · /ban von Moderator`]);
  });

  test('fehlt dem Bot das Recht oder sagt Discord 50013, ein Satz und kein Eintrag; 50007 bei der DM bannt trotzdem', async () => {
    bot = { ...bot, bannen: false };
    assert.equal(await fall('ban'), 'kitty fehlt das Recht dazu, oder die Rolle von kitty steht zu tief.');
    bot = { ...bot, bannen: true };
    fehler = { banne: new DiscordFehler('kein_recht', 'Missing Permissions') };
    assert.equal(await fall('ban'), 'kitty fehlt das Recht dazu, oder die Rolle von kitty steht zu tief.');
    const { rows } = await db.query('SELECT 1 FROM strafaktionen WHERE server = $1', [SERVER]);
    assert.equal(rows.length, 0);
    fehler = { dm: new DiscordFehler('kein_dm', 'Cannot send messages to this user') };
    assert.equal(await fall('ban'), 'nutzer-12 ist gebannt. Grund: Spam. Die DM kam nicht an; das Mitglied nimmt keine DMs von kitty an. Bans in 7 Tagen: 1 von 1.');
  });

  test('ohne DM beim Bann keine DM; der Grund im Audit-Log höchstens wie gegeben', async () => {
    einstellung = { ...einstellung, dm: false };
    assert.equal(await fall('ban', { grund: 'Werbung' }), 'nutzer-12 ist gebannt. Grund: Werbung. Bans in 7 Tagen: 1 von 1.');
    assert.deepEqual(getan, [`ban ${OPFER} Werbung · /ban von Moderator`]);
  });

  test('Verwarnung: DM mit Server und Grund, gespeichert, gezählt in der Frist des Servers; ohne Limit', async () => {
    for (let n = 1; n <= 3; n++) {
      jetzt += 60_000;
      assert.equal(await fall('warn'), `nutzer-12 ist verwarnt, zum ${n}. Mal. Grund: Spam. Die DM ist angekommen.`);
    }
    assert.equal(getan[0], `dm ${OPFER} Verwarnung auf Probe: Spam`);
    const { rows } = await db.query<{ moderator: string; grund: string }>('SELECT moderator, grund FROM verwarnungen WHERE server = $1', [SERVER]);
    assert.deepEqual(rows[0], { moderator: MOD, grund: 'Spam' });
    // Nach der Frist zählt eine Verwarnung nicht mehr mit, auch vor dem Aufräumen:
    // 30 Tage nach der ersten, aber vor der zweiten; mit der neuen sind es 3.
    einstellung = { ...einstellung, verwarnungTage: 30 };
    jetzt += 30 * 86_400_000 - 90_000;
    assert.equal(await fall('warn'), 'nutzer-12 ist verwarnt, zum 3. Mal. Grund: Spam. Die DM ist angekommen.');
  });

  test('„custom“ öffnet das Formular; abgeschickt bannt es mit dem eigenen Grund', async () => {
    const befehl = befehle.befehle().find((b) => b.name === 'ban');
    assert.ok(befehl);
    const formulare: Formular[] = [];
    await befehl.ausfuehren(
      falscherAufruf({
        ort: { server, wer: person(MOD, 'Moderator'), rang: rang(5, [R_MOD]) },
        text: () => 'Custom',
        ziel: () => ({ person: person(OPFER), rang: rang(1) }),
        zeigeFormular: async (f) => void formulare.push(f),
      }),
    );
    assert.equal(formulare[0]?.id, `strafe:ban:${OPFER}`);
    assert.deepEqual(getan, []);

    const antworten: string[] = [];
    const druck = {
      art: 'formular',
      aktion: `ban:${OPFER}`,
      server,
      kanal: null,
      nutzer: MOD,
      wer: person(MOD, 'Moderator'),
      rang: rang(5, [R_MOD]),
      bot: BOT,
      wert: ' Eigener Text ',
      beantwortet: false,
      warte: async () => {},
      fertig: async (t: string) => void antworten.push(t),
    } as unknown as Druck;
    await befehle.formular(druck);
    assert.deepEqual(antworten, ['nutzer-12 ist gebannt. Grund: Eigener Text. Die DM ist angekommen. Bans in 7 Tagen: 1 von 1.']);
    assert.equal(getan.at(-1), `ban ${OPFER} Eigener Text · /ban von Moderator`);
  });

  test('freier Text ist ein eigener Grund ohne Formular; nur „custom“ öffnet es, gross oder klein', async () => {
    const befehl = befehle.befehle().find((b) => b.name === 'kick');
    assert.ok(befehl);
    const formulare: Formular[] = [];
    const antworten: string[] = [];
    const aufruf = (grund: string) =>
      falscherAufruf({
        ort: { server, wer: person(MOD, 'Moderator'), rang: rang(5, [R_MOD]) },
        text: () => grund,
        ziel: () => ({ person: person(OPFER), rang: rang(1) }),
        zeigeFormular: async (f) => void formulare.push(f),
        warte: async () => {},
        fertig: async (t) => void antworten.push(t),
      });
    await befehl.ausfuehren(aufruf('Nicht in der Liste'));
    assert.deepEqual(formulare, []);
    assert.deepEqual(antworten, ['nutzer-12 ist gekickt. Grund: Nicht in der Liste. Kicks in 7 Tagen: 1 von 2.']);
    assert.equal(getan.at(-1), `kick ${OPFER} Nicht in der Liste · /kick von Moderator`);
    await befehl.ausfuehren(aufruf(' CUSTOM '));
    assert.equal(formulare.length, 1);
  });

  test('ein Befehl schiebt die Antwort auf und setzt sie danach', async () => {
    const befehl = befehle.befehle().find((b) => b.name === 'kick');
    assert.ok(befehl);
    const schritte: string[] = [];
    await befehl.ausfuehren(
      falscherAufruf({
        ort: { server, wer: person(MOD, 'Moderator'), rang: rang(5, [R_MOD]) },
        text: () => ' Spam ',
        ziel: () => ({ person: person(OPFER), rang: rang(1) }),
        warte: async () => void schritte.push('warte'),
        fertig: async (t) => void schritte.push(t),
      }),
    );
    assert.deepEqual(schritte, ['warte', 'nutzer-12 ist gekickt. Grund: Spam. Kicks in 7 Tagen: 1 von 2.']);
  });

  test('Aufräumen: Bans und Kicks nach 7 Tagen, Verwarnungen nach der Frist ihres Servers, ohne Einstellung 365 Tage', async () => {
    await speichereStrafen(db, SERVER, { ...ohneEinstellung(), verwarnungTage: 30 });
    const tage = (n: number) => new Date(jetzt - n * 86_400_000);
    await db.query('INSERT INTO strafaktionen (server, moderator, art, zeit) VALUES ($1, $2, $3, $4), ($1, $2, $3, $5)', [SERVER, MOD, 'ban', tage(8), tage(6)]);
    await db.query(
      `INSERT INTO verwarnungen (server, ziel, moderator, grund, zeit) VALUES
       ($1, $3, $4, 'alt', $5), ($1, $3, $4, 'neu', $6), ($2, $3, $4, 'alt', $7), ($2, $3, $4, 'neu', $5)`,
      [SERVER, ANDERER, OPFER, MOD, tage(31), tage(29), tage(366)],
    );
    assert.equal(await raeumeStrafenAuf(db, jetzt), 3);
    const { rows: aktionen } = await db.query('SELECT 1 FROM strafaktionen WHERE server = $1', [SERVER]);
    assert.equal(aktionen.length, 1);
    const { rows: warnungen } = await db.query<{ server: string; grund: string }>('SELECT server, grund FROM verwarnungen WHERE server = ANY($1) ORDER BY server', [[SERVER, ANDERER]]);
    assert.deepEqual(warnungen, [
      { server: SERVER, grund: 'neu' },
      { server: ANDERER, grund: 'neu' },
    ]);
  });

  test('die Seite: Standard, Rollen als Optionen, Hinweis ohne Rechte, Fund für eine gelöschte Rolle, Speichern', async () => {
    const geleert: string[] = [];
    let rechte = { bannen: true, kicken: false };
    const bereich = strafenBereich({
      db,
      rollen: () => [
        { id: R_STARK, name: 'Stark' },
        { id: R_MOD, name: 'Mod' },
      ],
      rechte: () => rechte,
      einstellungen: { delete: (s) => geleert.push(s) },
    });
    const k = { server, mitglied: {} } as unknown as Kontext;
    const [seite] = await bereich.zeige(k);
    assert.ok(seite);
    assert.deepEqual(seite.wert, ohneEinstellung());
    assert.deepEqual(
      seite.bausteine.map((b) => b.id),
      ['rechte', 'gruende', 'limits', 'dm', 'dmText', 'entbannung', 'verwarnungTage'],
    );
    const limits = seite.bausteine.find((b) => b.id === 'limits');
    assert.ok(limits?.art === 'liste');
    const auswahl = limits.bausteine.find((b) => b.id === 'rolle');
    assert.ok(auswahl?.art === 'auswahl');
    assert.deepEqual(auswahl.optionen.map((o) => o.name), ['Stark', 'Mod']);
    rechte = { bannen: true, kicken: true };
    assert.equal((await bereich.zeige(k))[0]?.bausteine[0]?.id, 'gruende');

    const neu = { ...ohneEinstellung(), limits: [{ rolle: R_MOD, bans: 2, kicks: 2 }] };
    const antwort = await bereich.speichere(k, 'strafen', neu);
    assert.deepEqual(antwort.meldung, { titel: 'Gespeichert.', text: 'Mitglieder mit einer Rolle aus der Liste nutzen die Befehle.' });
    assert.deepEqual(await liesStrafen(db, SERVER), neu);
    assert.deepEqual(geleert, [SERVER]);
    await assert.rejects(bereich.speichere(k, 'strafen', { ...neu, limits: [{ rolle: R_LEER, bans: 1, kicks: 1 }] }), (e: unknown) => e instanceof BausteinFehler && e.code === 'rolle_unbekannt' && e.feld === 'limits.0.rolle');

    await speichereStrafen(db, SERVER, { ...neu, limits: [{ rolle: R_LEER, bans: 1, kicks: 1 }] });
    assert.deepEqual((await bereich.zeige(k))[0]?.fund, { code: 'rolle_unbekannt', feld: 'limits.0.rolle' });
  });
});
