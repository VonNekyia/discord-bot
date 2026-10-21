import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { CDN, type Client, type GuildMember } from 'discord.js';
import type { Pool } from 'pg';
import { legeSitzungAn } from './anmeldung.js';
import { erstelleApi, type Api } from './server.js';
import { BausteinFehler, type Baustein, type Bereich, type Eintrag, type Satz, type Seite } from '../kern/baukasten.js';
import { migriere, oeffne, verbindung } from '../kern/datenbank.js';
import { Zaehlung } from '../kern/zaehlung.js';
import type { DashboardGriff } from '../discord/dashboard.js';
import { kontextVon, type Kontext } from '../discord/kontext.js';
import { ANWENDUNG, DASHBOARD, discordClient, frage, GEHEIMNIS, gilde, mitglied, mockDiscord, pngKopf, ROLLE_TEAM, schliesse, type MockDiscord } from '../testhilfe.js';

// Erzeugt jede Antwort der API mit festen Werten und vergleicht sie mit den
// Beispielen des Vertrags; mit BEISPIELE_SCHREIBEN=1 schreibt er sie neu.
// Ohne DB_HOST übersprungen, in der CI immer dabei.
// Siehe docs/entwicklung/tests.md, „Beispiele des Vertrags“.
const ziel = verbindung();
if (!ziel && process.env.CI) throw new Error('In der CI muss die Datenbank da sein: DB_* fehlt.');
const ordner = fileURLToPath(new URL('../../../docs/schnittstelle/beispiele/', import.meta.url));
const schreiben = process.env.BEISPIELE_SCHREIBEN === '1';

// Nur erfundene Werte (AGENTS.md, Regel 21).
const MIA = '100000000000000002';
const NOAH = '100000000000000003';
const TERRANOVA = '200000000000000001';
const KANAL = '300000000000000001';
const REGELN = '300000000000000002';
const OHNE_KATEGORIE = '300000000000000003';
const KATEGORIE = '300000000000000004';
const ROLLE = '300000000000000011';
const ROLLE_HOCH = '300000000000000012';
const AVATAR = 'b5f2c0de9a1e4f7a8c3d2e1f0a9b8c7d';
const ICON = '6e1d3f2a9c8b7a6f5e4d3c2b1a0f9e8d';
const START = Date.parse('2026-10-21T08:00:00.000Z');

// Jedes optionale Feld Pflicht, auch in Listen und Objekten darin.
type Voll<T> = T extends readonly (infer E)[] ? Voll<E>[] : T extends object ? { [K in keyof T]-?: Voll<T[K]> } : T;

const satz = (titel: string, text: string): Satz => ({ titel, text });

// Je Art ein Baustein mit jedem optionalen Feld. Fehlt eine Art oder ein
// optionales Feld, auch in einer Bedingung oder in der Liste, baut `tsc` nicht.
const bausteine = {
  schalter: {
    art: 'schalter',
    id: 'aktiv',
    titel: 'Aktiv',
    hilfe: 'Sendet bei jedem Beitritt in {kanal}.',
    braucht: [{ feld: 'kanal', merkmal: 'senden', sonst: 'Erst einen Kanal wählen, in dem der Bot senden darf.' }],
    gesperrt: { grund: 'Das geht erst mit Freischaltung.', code: 'nicht_freigeschaltet' },
  },
  auswahl: {
    art: 'auswahl',
    id: 'kanal',
    titel: 'Kanal',
    hilfe: 'Nur Kanäle, in denen der Bot senden darf.',
    leer: 'Kein Kanal',
    optionen: [
      { id: KANAL, name: '#willkommen', gruppe: { id: KATEGORIE, name: 'Start' }, merkmale: ['senden', 'bilder'], gesperrt: null },
      {
        id: REGELN,
        name: '#regeln',
        gruppe: { id: KATEGORIE, name: 'Start' },
        merkmale: ['senden'],
        gesperrt: { grund: 'Der Bot darf dort keine Bilder senden.', code: 'kanal_ohne_bilder' },
      },
      { id: OHNE_KATEGORIE, name: '#ohne-kategorie', gruppe: null, merkmale: [], gesperrt: null },
    ],
    unbekannt: 'Den Kanal gibt es nicht mehr.',
    pflicht: 'Wähle einen Kanal.',
    einmalig: 'Jeder Kanal nur einmal.',
    vergeben: 'schon gewählt',
  },
  text: {
    art: 'text',
    id: 'nachricht',
    titel: 'Nachricht',
    hilfe: 'Mit {name} und {server}.',
    mehrzeilig: true,
    grenze: 2000,
    platzhalter: { name: 32, server: 100 },
    rechnung: 'Platzhalter zählen mit ihrer längsten Länge.',
    pflicht: 'Die Nachricht fehlt.',
  },
  zahl: { art: 'zahl', id: 'anzahl', titel: 'Anzahl', hilfe: 'Wie oft am Tag.', min: 1, max: 10, ungueltig: 'Eine ganze Zahl von 1 bis 10.' },
  bild: {
    art: 'bild',
    id: 'bild',
    titel: 'Bild',
    hilfe: 'PNG, JPEG oder WebP.',
    typen: ['image/png', 'image/jpeg', 'image/webp'],
    groesse: 4_194_304,
    pixel: { min: 200, max: 4096 },
    entfernen: 'Bild entfernen',
  },
  vorschau: {
    art: 'vorschau',
    id: 'vorschau',
    titel: 'Vorschau',
    alt: 'Vorschau des Banners',
    breite: 1000,
    hoehe: 400,
    braucht: 'bild',
    leer: satz('Noch kein Bild.', 'Lade ein Bild hoch, dann steht hier die Vorschau.'),
    fehler: satz('Die Vorschau fehlt.', 'Lade die Seite neu.'),
  },
  aktion: {
    art: 'aktion',
    id: 'test',
    titel: 'Testnachricht senden',
    laeuft: 'Sendet …',
    hilfe: 'Schickt die gespeicherte Nachricht in den Kanal.',
    ungespeichert: 'Erst speichern, dann testen.',
  },
  liste: {
    art: 'liste',
    id: 'rollen',
    eintrag: 'Rolle',
    kopf: 'rolle',
    hoechstens: 5,
    hinzufuegen: 'Rolle hinzufügen',
    entfernen: 'Entfernen',
    voll: 'Höchstens 5 Rollen.',
    leer: satz('Noch keine Rolle.', 'Füge eine hinzu.'),
    neu: { an: false, rolle: null, name: '', grenze: 0 },
    bausteine: [
      {
        art: 'schalter',
        id: 'an',
        titel: 'An',
        hilfe: 'Gilt nur für diese Rolle.',
        braucht: [{ feld: 'rolle', merkmal: 'zuweisbar', sonst: 'Erst eine Rolle wählen, die der Bot vergeben darf.' }],
        gesperrt: { grund: 'Das geht erst mit Freischaltung.', code: 'nicht_freigeschaltet' },
      },
      {
        art: 'auswahl',
        id: 'rolle',
        titel: 'Rolle',
        hilfe: 'Nur Rollen unter der des Bots.',
        leer: 'Keine Rolle',
        optionen: [
          { id: ROLLE, name: 'Gäste', gruppe: null, merkmale: ['zuweisbar'], gesperrt: null },
          { id: ROLLE_HOCH, name: 'Team', gruppe: null, merkmale: [], gesperrt: { grund: 'Die Rolle steht über der des Bots.', code: 'rolle_zu_hoch' } },
        ],
        unbekannt: 'Die Rolle gibt es nicht mehr.',
        pflicht: 'Wähle eine Rolle.',
        einmalig: 'Jede Rolle nur einmal.',
        vergeben: 'schon gewählt',
      },
      {
        art: 'text',
        id: 'name',
        titel: 'Name',
        hilfe: 'Steht vor {name}.',
        mehrzeilig: false,
        grenze: 100,
        platzhalter: { name: 32 },
        rechnung: 'Platzhalter zählen mit ihrer längsten Länge.',
        pflicht: 'Der Name fehlt.',
      },
      { art: 'zahl', id: 'grenze', titel: 'Grenze', hilfe: '0 heisst ohne.', min: 0, max: 99, ungueltig: 'Eine ganze Zahl von 0 bis 99.' },
    ],
  },
  hinweis: { art: 'hinweis', id: 'hinweis', ton: 'info', satz: satz('Neu hier?', 'Wähle zuerst einen Kanal.') },
  link: {
    art: 'link',
    id: 'link',
    titel: 'Kanal in Discord öffnen',
    url: `https://discord.com/channels/${TERRANOVA}/${KANAL}`,
    hilfe: 'Öffnet in einem neuen Tab.',
  },
} satisfies { [A in Baustein['art']]: Voll<Extract<Baustein, { art: A }>> };

const { vorschau, ...formular } = bausteine;
const wert: Eintrag = {
  aktiv: false,
  kanal: KANAL,
  nachricht: 'Willkommen, {name}!',
  anzahl: 3,
  bild: true,
  rollen: [{ an: true, rolle: ROLLE, name: 'Gäste', grenze: 2 }],
};
// Die erste Seite hat jede Art, jedes optionale Feld und einen `fund`; die
// zweite zeigt, was fehlen oder leer sein darf.
const seiten: Seite[] = [
  {
    id: 'probe',
    titel: 'Probe',
    bausteine: Object.values(formular),
    daneben: [vorschau],
    wert,
    saetze: {
      kanal_fehlt: satz('Den Kanal gibt es nicht mehr.', 'Wähle einen anderen.'),
      kanal_ohne_bilder: satz('Der Bot darf dort keine Bilder senden.', 'Gib ihm das Recht oder wähle einen anderen Kanal.'),
      nicht_freigeschaltet: satz('Das ist nicht freigeschaltet.', 'Schalte es auf dem Board frei.'),
      rolle_zu_hoch: satz('Die Rolle steht über der des Bots.', 'Schiebe die Rolle des Bots höher.'),
    },
    fund: { code: 'kanal_fehlt', feld: 'kanal' },
    alleNeu: true,
  } satisfies Voll<Seite>,
  {
    id: 'zweite',
    titel: 'Zweite',
    bausteine: [{ art: 'hinweis', id: 'still', ton: 'warn', satz: satz('Hier gibt es nichts.', 'Nimm die erste Seite.') }],
    daneben: [],
    wert: {},
    saetze: {},
    fund: null,
  },
];
const gespeichert = satz('Gespeichert.', 'Die Probe gilt ab jetzt.');
const gesendet = satz('Gesendet.', 'Die Testnachricht steht in #willkommen.');
const png = pngKopf(1000, 400);

// Ein Modul mit festen Seiten; jeder Baustein mit Route hat seine Funktion.
const probe: Bereich<Kontext> = {
  seiten: { probe: { bild: 'bild', vorschau: 'vorschau', test: 'aktion' }, zweite: {} },
  zeige: async () => seiten,
  // Eine einzige Regel, für den Fehler am Feld.
  async speichere(_k, _seite, eingabe) {
    if (typeof eingabe !== 'object' || eingabe === null || !('anzahl' in eingabe) || eingabe.anzahl !== wert.anzahl) {
      throw new BausteinFehler(400, 'ungueltig', 'anzahl');
    }
    return { wert, meldung: gespeichert };
  },
  async ladeHoch(_k, _seite, _baustein, datei) {
    await datei.lies(1024, 'bild_zu_gross');
  },
  loesche: async () => undefined,
  zeichne: async () => png,
  loeseAus: async () => gesendet,
};

type Beispiel = { route: string; status: number; typ: string; body: unknown };

// Eine Anfrage; `beispiel` hat sie genau dann, wenn JSON zurückkommt.
interface Fall {
  methode: 'GET' | 'PUT' | 'DELETE' | 'POST';
  pfad: string;
  sitzung?: string;
  typ?: string;
  body?: string | Buffer;
  status: number;
  beispiel?: { datei: string; typ: string };
}

// `{id}`, `{seite}` und `{baustein}` einer Vorlage passen auf ein Segment.
const alsMuster = (vorlage: string) => new RegExp(`^${vorlage.replaceAll(/\{(id|seite|baustein)\}/g, '[^/]+')}$`);

describe('Beispiele des Vertrags', { skip: ziel ? false : 'keine Datenbank, DB_HOST fehlt' }, () => {
  let db: Pool;
  let mock: MockDiscord;
  let client: Client;
  let api: Api;
  let basis: string;
  let mia: string;
  let noah: string;
  // Die Uhr der Zählung für Debug; sie steht, während die Fälle laufen.
  let jetzt = START;
  const zaehlung = new Zaehlung({ uhr: () => jetzt, log: () => undefined });

  before(async () => {
    if (!ziel) return;
    await migriere(ziel, fileURLToPath(new URL('../../migrationen', import.meta.url)));
    db = oeffne(ziel);
    mock = await mockDiscord();
    client = discordClient(mock, [gilde(TERRANOVA, 'Terranova', MIA)]);
    const guild = client.guilds.cache.get(TERRANOVA);
    if (!guild) throw new Error('Terranova fehlt im Cache.');
    // Mitglieder hält der Cache nicht; `_add` baut eins wie von Discord.
    const person = (guild.members as unknown as { _add(d: unknown): GuildMember })._add(mitglied(MIA, [ROLLE_TEAM]));
    const kontext = kontextVon(guild, person);

    // Feste Antworten von Discord, je eine Minute später.
    const kopf = (werte: Record<string, string>) => (name: string) => werte[name] ?? null;
    jetzt = START + 60_000;
    zaehlung.antwort({
      methode: 'get',
      pfad: `/guilds/${TERRANOVA}/members/${MIA}`,
      status: 200,
      kopf: kopf({ 'x-ratelimit-limit': '5', 'x-ratelimit-remaining': '4', 'x-ratelimit-reset-after': '1.5' }),
    });
    jetzt = START + 120_000;
    zaehlung.antwort({
      methode: 'post',
      pfad: `/channels/${KANAL}/messages`,
      status: 429,
      kopf: kopf({ 'x-ratelimit-limit': '5', 'x-ratelimit-remaining': '0', 'x-ratelimit-reset-after': '2.25', 'x-ratelimit-scope': 'user', 'retry-after': '3' }),
    });
    jetzt = START + 180_000;
    zaehlung.antwort({
      methode: 'post',
      pfad: `/channels/${KANAL}/messages`,
      status: 200,
      kopf: kopf({ 'x-ratelimit-limit': '5', 'x-ratelimit-remaining': '4', 'x-ratelimit-reset-after': '4.5' }),
    });
    zaehlung.antwort({ methode: 'patch', pfad: `/channels/${KANAL}`, status: 500, kopf: kopf({}) });
    zaehlung.griff('sitzung');
    jetzt = START + 300_000;

    // Avatar und Icon über die CDN-Basis von discord.js, wie im Bot.
    const cdn = new CDN();
    const griff: DashboardGriff = {
      frage: async () => {
        throw new Error('Die Beispiele fragen Discord nie.');
      },
      darfDebug: async (nutzer) => nutzer === MIA,
      debug: () => zaehlung.stand([0]),
      avatar: (nutzer, hash) => cdn.avatar(nutzer, hash, { size: 128 }),
      server: (ids) => (ids.includes(TERRANOVA) ? [{ id: TERRANOVA, name: 'Terranova', icon: cdn.icon(TERRANOVA, ICON, { size: 128 }) }] : []),
      verwaltet: async (id, nutzer) => (id !== TERRANOVA ? 'kein_server' : nutzer === MIA ? kontext : 'kein_recht'),
    };
    api = erstelleApi({ griff, db, anwendung: ANWENDUNG, geheimnis: GEHEIMNIS, dashboard: DASHBOARD, bereiche: [probe] });
    await new Promise<void>((fertig) => api.listen(0, '127.0.0.1', fertig));
    basis = `http://127.0.0.1:${(api.address() as AddressInfo).port}`;
    mia = await legeSitzungAn(db, { nutzer: MIA, name: 'Mia', avatar: AVATAR, server: [TERRANOVA] });
    noah = await legeSitzungAn(db, { nutzer: NOAH, name: 'Noah', avatar: null, server: [] });
  });

  after(async () => {
    if (!ziel) return;
    await db.query('DELETE FROM sitzungen WHERE nutzer = ANY($1)', [[MIA, NOAH]]);
    api.closeAllConnections();
    await new Promise((fertig) => api.close(fertig));
    await schliesse(mock);
    await client.destroy();
    await db.end();
  });

  test('jede Route klappt in einem Fall, schickt, was `antwort` sagt, und jedes JSON gleicht seinem Beispiel', async (t) => {
    const log = t.mock.method(console, 'error', () => undefined);
    const seite = `/api/server/${TERRANOVA}/seiten`;
    const json = 'application/json';
    // Abmelden zuletzt: Es löscht die Sitzung von Mia.
    const faelle: Fall[] = [
      { methode: 'GET', pfad: '/api/anmelden', status: 302 },
      { methode: 'GET', pfad: '/api/anmelden/zurueck', status: 302 },
      { methode: 'GET', pfad: '/api/ich', sitzung: mia, status: 200, beispiel: { datei: 'ich', typ: 'Ich' } },
      { methode: 'GET', pfad: '/api/ich', sitzung: noah, status: 200, beispiel: { datei: 'ich-ohne-avatar', typ: 'Ich' } },
      { methode: 'GET', pfad: '/api/ich', status: 401, beispiel: { datei: 'fehler', typ: 'Fehler' } },
      { methode: 'GET', pfad: '/api/server', sitzung: mia, status: 200, beispiel: { datei: 'server', typ: 'Server[]' } },
      { methode: 'GET', pfad: '/api/server', sitzung: noah, status: 200, beispiel: { datei: 'server-leer', typ: 'Server[]' } },
      { methode: 'GET', pfad: '/api/debug', sitzung: mia, status: 200, beispiel: { datei: 'debug', typ: 'Debug' } },
      { methode: 'GET', pfad: seite, sitzung: mia, status: 200, beispiel: { datei: 'seiten', typ: 'Seite[]' } },
      { methode: 'PUT', pfad: `${seite}/probe`, sitzung: mia, typ: json, body: JSON.stringify(wert), status: 200, beispiel: { datei: 'gespeichert', typ: 'Gespeichert' } },
      {
        methode: 'PUT',
        pfad: `${seite}/probe`,
        sitzung: mia,
        typ: json,
        body: JSON.stringify({ ...wert, anzahl: 11 }),
        status: 400,
        beispiel: { datei: 'fehler-feld', typ: 'Fehler' },
      },
      { methode: 'PUT', pfad: `${seite}/probe/bild`, sitzung: mia, typ: 'image/png', body: png, status: 204 },
      { methode: 'DELETE', pfad: `${seite}/probe/bild`, sitzung: mia, status: 204 },
      { methode: 'GET', pfad: `${seite}/probe/vorschau`, sitzung: mia, status: 200 },
      { methode: 'POST', pfad: `${seite}/probe/test`, sitzung: mia, status: 200, beispiel: { datei: 'satz', typ: 'Satz' } },
      { methode: 'POST', pfad: '/api/abmelden', sitzung: mia, status: 204 },
    ];

    const beispiele = new Map<string, Beispiel>();
    const geklappt = new Set<string>();
    for (const f of faelle) {
      const wo = `${f.methode} ${f.pfad}`;
      const route = api.routen.find((r) => r.methode === f.methode && r.muster.test(f.pfad));
      assert.ok(route, `${wo}: keine Route`);
      assert.match(wo, alsMuster(route.vorlage), `${wo}: passt nicht zur Vorlage ${route.vorlage}`);
      const headers: Record<string, string> = f.methode === 'GET' ? {} : { origin: DASHBOARD };
      if (f.typ) headers['content-type'] = f.typ;
      const antwort = await frage(basis, f.pfad, { method: f.methode, sitzung: f.sitzung, headers, body: f.body });
      assert.equal(antwort.status, f.status, wo);
      const typ = antwort.headers.get('content-type') ?? '';
      // Ein Fehler ist immer JSON, siehe docs/schnittstelle/api.md, „Fehler“.
      const art = antwort.status < 400 ? route.antwort : 'json';
      if (antwort.status < 400) geklappt.add(route.vorlage);
      if (art === 'json') {
        assert.ok(typ.startsWith(json), `${wo}: ${antwort.status} mit Content-Type „${typ}“, erwartet JSON`);
        assert.ok(f.beispiel, `${wo}: JSON ohne Beispiel`);
        assert.ok(!beispiele.has(f.beispiel.datei), `${f.beispiel.datei} doppelt`);
        beispiele.set(f.beispiel.datei, { route: route.vorlage, status: antwort.status, typ: f.beispiel.typ, body: await antwort.json() });
        continue;
      }
      assert.equal(f.beispiel, undefined, `${wo}: Beispiel ohne JSON`);
      const body = Buffer.from(await antwort.arrayBuffer());
      if (art === 'png') {
        assert.equal(typ, 'image/png', wo);
        assert.ok(body.equals(png), wo);
      } else if (art === 'leer') {
        assert.equal(antwort.status, 204, wo);
        assert.equal(body.length, 0, wo);
      } else {
        assert.equal(antwort.status, 302, wo);
        assert.ok(antwort.headers.get('location'), wo);
      }
    }
    // Ohne state-Cookie leitet die Anmeldung mit Fehler weiter und loggt ihn.
    assert.deepEqual(
      log.mock.calls.map((c) => String(c.arguments[0])),
      ['Anmeldung: state fehlt oder passt nicht'],
    );

    // Jede Vorlage hat einen Fall, in dem sie klappt; eine mit JSON hat so ein Beispiel.
    for (const r of api.routen) {
      assert.ok(geklappt.has(r.vorlage), `${r.vorlage}: kein Fall, in dem sie klappt`);
      if (r.antwort === 'json') assert.ok([...beispiele.values()].some((b) => b.route === r.vorlage && b.status < 400), `${r.vorlage}: kein Beispiel`);
    }

    const dateien = new Map([...beispiele].map(([name, b]) => [`${name}.json`, b]));
    const da = existsSync(ordner) ? readdirSync(ordner).filter((d) => d.endsWith('.json')) : [];
    if (schreiben) {
      mkdirSync(ordner, { recursive: true });
      for (const datei of da) if (!dateien.has(datei)) rmSync(join(ordner, datei));
      for (const [datei, b] of dateien) writeFileSync(join(ordner, datei), `${JSON.stringify(b, null, 2)}\n`);
      return;
    }
    for (const datei of da) assert.ok(dateien.has(datei), `${datei}: kein Fall erzeugt sie mehr; BEISPIELE_SCHREIBEN=1 löscht sie`);
    for (const [datei, b] of dateien) {
      assert.ok(da.includes(datei), `${datei} fehlt; BEISPIELE_SCHREIBEN=1 schreibt sie`);
      assert.deepEqual(JSON.parse(readFileSync(join(ordner, datei), 'utf8')), b, `${datei} weicht ab; BEISPIELE_SCHREIBEN=1 schreibt sie neu`);
    }
  });
});
