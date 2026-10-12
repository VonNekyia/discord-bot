import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { PermissionFlagsBits as R } from 'discord.js';
import {
  banne,
  besitzerRechte,
  botRechte,
  entbanne,
  entsperre,
  gebannt,
  gesperrt,
  mitBesitzer,
  sperre,
  verstecke,
  versteckt,
  zeige,
  type Eintrag,
  type Raum,
} from './raumrechte.js';

// Reine Daten, ohne Discord. Alle IDs sind erfunden.
// Siehe docs/bot/sprachraeume-menue.md, „Rechte im Raum“.
const SERVER = '300000000000000010';
const BOT = '100000000000000001';
const BESITZER = '200000000000000041';
const GAST = '200000000000000042';
const DRITTER = '200000000000000043';
const ROLLE = '400000000000000011';
const rolle = 'rolle';
const person = 'person';

const e = (id: string, art: Eintrag['art'], allow: bigint, deny: bigint): Eintrag => ({ id, art, allow, deny });
// Eine übliche Kategorie: @everyone sieht nichts, eine Rolle sieht und darf sich verbinden.
const kategorie = [e(SERVER, rolle, 0n, R.ViewChannel), e(ROLLE, rolle, R.ViewChannel | R.Connect, 0n)];
// Der Raum, wie `eintraege` ihn anlegt.
const start = [...kategorie, e(BESITZER, person, besitzerRechte, 0n), e(BOT, person, botRechte, 0n)];

const raum = (eintraege: Eintrag[] = start, k: Eintrag[] = kategorie): Raum => ({
  eintraege,
  kategorie: k,
  server: SERVER,
  besitzer: BESITZER,
  bot: BOT,
});
const sortiert = (liste: Eintrag[]) => liste.toSorted((a, b) => a.id.localeCompare(b.id));
const von = (liste: Eintrag[], id: string) => liste.find((x) => x.id === id);

describe('Rechte im Raum', () => {
  test('mit der Kategorie allein ist ein Raum weder gesperrt noch versteckt, und niemand ist gebannt', () => {
    assert.equal(gesperrt(raum()), false);
    assert.equal(versteckt(raum()), false);
    assert.deepEqual(gebannt(raum()), []);
  });

  test('Sperren: @everyone und Rollen ohne Verbinden, wer drin ist, mit eigenem; Entsperren stellt die Kategorie wieder her', () => {
    const zu = sperre(raum(), [BESITZER, GAST, BOT]);
    assert.deepEqual(von(zu, SERVER), e(SERVER, rolle, 0n, R.ViewChannel | R.Connect));
    assert.deepEqual(von(zu, ROLLE), e(ROLLE, rolle, R.ViewChannel, R.Connect));
    assert.deepEqual(von(zu, GAST), e(GAST, person, R.Connect, 0n));
    assert.deepEqual(von(zu, BESITZER), von(start, BESITZER));
    assert.deepEqual(von(zu, BOT), von(start, BOT));
    assert.equal(gesperrt(raum(zu)), true);
    assert.equal(versteckt(raum(zu)), false);
    assert.deepEqual(sortiert(entsperre(raum(zu))), sortiert(start));
  });

  test('ohne Kategorie legt Sperren einen Eintrag für @everyone an, und Entsperren nimmt ihn wieder weg', () => {
    const ohne = [e(BESITZER, person, besitzerRechte, 0n), e(BOT, person, botRechte, 0n)];
    const zu = sperre(raum(ohne, []), [BESITZER]);
    assert.deepEqual(von(zu, SERVER), e(SERVER, rolle, 0n, R.Connect));
    assert.equal(gesperrt(raum(zu, [])), true);
    assert.deepEqual(sortiert(entsperre(raum(zu, []))), sortiert(ohne));
  });

  test('erlaubt eine Rolle Verbinden, ist der Raum offen, auch wenn @everyone es verbietet', () => {
    const halb = start.map((x) => (x.id === SERVER ? e(SERVER, rolle, 0n, R.ViewChannel | R.Connect) : x));
    assert.equal(gesperrt(raum(halb)), false);
  });

  test('Verstecken: @everyone und Rollen sehen nichts, wer drin ist, sieht und verbindet sich; Zeigen stellt die Kategorie wieder her', () => {
    const weg = verstecke(raum(), [GAST]);
    assert.deepEqual(von(weg, ROLLE), e(ROLLE, rolle, R.Connect, R.ViewChannel));
    assert.deepEqual(von(weg, GAST), e(GAST, person, R.ViewChannel | R.Connect, 0n));
    assert.equal(versteckt(raum(weg)), true);
    assert.equal(gesperrt(raum(weg)), false);
    assert.deepEqual(sortiert(zeige(raum(weg))), sortiert(start));
  });

  test('Zeigen, während der Raum gesperrt ist: wer drin war, behält Verbinden', () => {
    const zu = sperre(raum(), [GAST]);
    const weg = verstecke(raum(zu), [GAST]);
    const wieder = zeige(raum(weg));
    assert.deepEqual(von(wieder, GAST), e(GAST, person, R.Connect, 0n));
    assert.equal(gesperrt(raum(wieder)), true);
    assert.equal(versteckt(raum(wieder)), false);
    assert.deepEqual(sortiert(entsperre(raum(wieder))), sortiert(start));
  });

  test('Bannen verbietet Sehen und Verbinden, auch wer eigene Rechte hatte; Entbannen stellt die Kategorie wieder her', () => {
    const mitRecht = sperre(raum(), [GAST]);
    const raus = banne(raum(mitRecht), GAST);
    assert.deepEqual(von(raus, GAST), e(GAST, person, 0n, R.ViewChannel | R.Connect));
    assert.deepEqual(gebannt(raum(raus)), [GAST]);
    assert.deepEqual(sortiert(entbanne(raum(banne(raum(), GAST)), GAST)), sortiert(start));
  });

  test('Gebannte bleiben beim Sperren, Entsperren, Verstecken und Zeigen gebannt', () => {
    const raus = banne(raum(), GAST);
    const zu = sperre(raum(raus), [GAST]);
    assert.deepEqual(gebannt(raum(zu)), [GAST]);
    assert.deepEqual(gebannt(raum(entsperre(raum(zu)))), [GAST]);
    const weg = verstecke(raum(raus), [GAST]);
    assert.deepEqual(gebannt(raum(zeige(raum(weg)))), [GAST]);
  });

  test('wen die Kategorie aussperrt, ist im Raum nicht gebannt, und Entbannen ändert daran nichts', () => {
    const k = [...kategorie, e(DRITTER, person, 0n, R.ViewChannel | R.Connect)];
    const r = raum([...start, e(DRITTER, person, 0n, R.ViewChannel | R.Connect)], k);
    assert.deepEqual(gebannt(r), []);
    assert.deepEqual(sortiert(entbanne(r, DRITTER)), sortiert(r.eintraege));
  });

  test('Besitzer und Bot behalten ihre Rechte bei jedem Knopf', () => {
    const r = raum(verstecke(raum(sperre(raum(), [GAST])), [GAST]));
    for (const liste of [r.eintraege, entsperre(r), zeige(r), banne(r, GAST)]) {
      assert.deepEqual(von(liste, BESITZER), von(start, BESITZER));
      assert.deepEqual(von(liste, BOT), von(start, BOT));
    }
  });

  test('ein neuer Besitzer bekommt dieselben Rechte wie der erste', () => {
    assert.deepEqual(von(mitBesitzer(raum(), GAST), GAST), e(GAST, person, besitzerRechte, 0n));
  });

  test('der alte Besitzer behält seinen Eintrag, bis Entsperren oder Zeigen ihn auf die Kategorie setzt', () => {
    // Nach der Übergabe gehört der Raum GAST; BESITZER hat nur noch einen eigenen Eintrag.
    const nachGast = (eintraege: Eintrag[]): Raum => ({ ...raum(eintraege), besitzer: GAST });
    const uebergeben = mitBesitzer(raum(), GAST);
    assert.deepEqual(von(uebergeben, BESITZER), von(start, BESITZER));

    // Gesperrt kommt er mit seinem eigenen „Verbinden“ weiter hinein, entsperrt gilt die Kategorie.
    const zu = sperre(nachGast(uebergeben), [GAST]);
    assert.deepEqual(von(zu, BESITZER), von(start, BESITZER));
    assert.deepEqual(von(entsperre(nachGast(zu)), BESITZER), e(BESITZER, person, R.ViewChannel | R.ReadMessageHistory, 0n));

    // Ebenso Verstecken und Zeigen: danach Sehen und Verbinden wie in der Kategorie.
    const weg = verstecke(nachGast(uebergeben), [GAST]);
    assert.deepEqual(von(weg, BESITZER), von(start, BESITZER));
    assert.deepEqual(von(zeige(nachGast(weg)), BESITZER), e(BESITZER, person, R.ReadMessageHistory, 0n));
  });
});
