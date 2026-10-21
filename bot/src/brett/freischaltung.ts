import { DatabaseError, type Pool } from 'pg';
import { aufShards } from '../kern/aufraeumen.js';
import { BausteinFehler } from '../kern/baukasten.js';
import { ladeCache } from '../kern/cache.js';
import { text } from '../kern/fehler.js';
import type { Kaeufe, Kauf, KaufEreignis } from '../discord/kaeufe.js';

// Ein Abo eines Servers und die Module, die es freischaltet.
export interface Abo {
  sku: string;
  module: readonly string[];
}

export interface FreischaltungOptionen {
  db: Pick<Pool, 'query'>;
  kaeufe: Kaeufe;
  // Je Modul die SKU seines Einmalkaufs; ohne Eintrag gibt es keinen.
  einmalkauf: ReadonlyMap<string, string>;
  abos: readonly Abo[];
  // Wie lange die Abos eines Servers im Cache bleiben, in ms; ohne Angabe 10 min.
  aboZeit?: number;
}

// Wann ein bezahltes Modul auf einem Server freigeschaltet ist: ein
// gebundener Einmalkauf oder ein laufendes Abo des Servers, das es enthält.
// Kennt kein Modul, nur die Namen, die bot/src/index.ts ihm gibt.
// Siehe docs/entscheidungen/0020-bezahlte-module.md.
export class Freischaltung {
  // Je Server die SKUs seiner gebundenen Käufe.
  private readonly gebunden;
  // Je Server seine laufenden Abos, 10 min; Ereignisse von Discord leeren ihn.
  private readonly laufend;
  private readonly aboSkus: string[];

  constructor(private readonly o: FreischaltungOptionen) {
    this.aboSkus = o.abos.map((a) => a.sku);
    // Gelesen bei jedem Ereignis, Befehl und Knopf eines bezahlten Moduls.
    // Siehe docs/bot/cache.md, „Wann cachen“.
    this.gebunden = ladeCache(async (server: string) => {
      const { rows } = await o.db.query<{ sku: string }>('SELECT sku FROM bindungen WHERE server = $1', [server]);
      return new Set(rows.map((z) => z.sku));
    });
    this.laufend = ladeCache((server: string) => o.kaeufe.vonServer(server, this.aboSkus), { ttl: o.aboZeit ?? 10 * 60_000 });
  }

  // Gibt es einen Einmalkauf für `modul`, den man binden kann?
  bindbar(modul: string): boolean {
    return this.o.einmalkauf.has(modul);
  }

  // Ist `modul` auf `server` freigeschaltet? Die Bindung zuerst; sie braucht
  // Discord nicht. Ein Abo zählt bis `ende`, auch wenn es noch im Cache steht.
  async frei(server: string, modul: string): Promise<boolean> {
    const sku = this.o.einmalkauf.get(modul);
    if (sku && (await this.gebunden.fetch(server))?.has(sku)) return true;
    const skus = new Set(this.o.abos.filter((a) => a.module.includes(modul)).map((a) => a.sku));
    if (skus.size === 0) return false;
    const jetzt = Date.now();
    return ((await this.laufend.fetch(server)) ?? []).some((k) => skus.has(k.sku) && !k.geloescht && (k.ende === null || k.ende > jetzt));
  }

  // Der Link zum Kaufen: zur SKU des Einmalkaufs, sonst in den Store, wenn
  // ein Abo das Modul enthält; sonst keiner.
  kaufen(modul: string): string | undefined {
    const sku = this.o.einmalkauf.get(modul);
    if (sku) return this.o.kaeufe.laden(sku);
    return this.o.abos.some((a) => a.module.includes(modul)) ? this.o.kaeufe.laden() : undefined;
  }

  // Bindet den ältesten freien Kauf von `nutzer` für `modul` an `server`:
  // erst eintragen, dann verbrauchen. Wirft `BausteinFehler`.
  // Siehe docs/schnittstelle/module.md, „Kauf binden“.
  async binde(server: string, nutzer: string, modul: string): Promise<void> {
    const sku = this.o.einmalkauf.get(modul);
    if (!sku) throw new BausteinFehler(404, 'nicht_gefunden');
    const schon = await this.frei(server, modul).catch(nichtErreichbar);
    if (schon) throw new BausteinFehler(400, 'schon_freigeschaltet');
    await this.nachverbrauche();
    const kaeufe = await this.o.kaeufe.vonPerson(nutzer, sku).catch(nichtErreichbar);
    const { rows } = await this.o.db.query<{ entitlement: string }>('SELECT entitlement FROM bindungen WHERE entitlement = ANY($1::bigint[])', [
      kaeufe.map((k) => k.id),
    ]);
    const gebunden = new Set(rows.map((z) => z.entitlement));
    const frei = kaeufe.filter((k) => !k.geloescht && !gebunden.has(k.id)).toSorted((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
    /* oxlint-disable no-await-in-loop */
    for (const kauf of frei) {
      if (!(await this.trageEin(kauf.id, server, sku))) continue;
      this.gebunden.delete(server);
      await this.verbrauche(kauf).catch((fehler: unknown) => console.error(`Kauf nicht verbraucht, der Bot holt es nach: ${text(fehler)}`));
      return;
    }
    /* oxlint-enable no-await-in-loop */
    throw new BausteinFehler(400, 'kein_kauf');
  }

  // Verbraucht, was gebunden, aber nicht als verbraucht vermerkt ist: beim
  // Start und vor jedem Binden. Das Log nennt nur Zahlen, keine IDs.
  async nachverbrauche(): Promise<void> {
    const { rows } = await this.o.db.query<{ entitlement: string }>('SELECT entitlement FROM bindungen WHERE NOT verbraucht');
    if (rows.length === 0) return;
    let geklappt = 0;
    /* oxlint-disable no-await-in-loop */
    for (const { entitlement } of rows) {
      const kauf = await this.o.kaeufe.einer(entitlement).catch(() => undefined);
      if (kauf && (await this.verbrauche(kauf).then(() => true, () => false))) geklappt += 1;
    }
    /* oxlint-enable no-await-in-loop */
    console.log(`Käufe nachverbraucht: ${geklappt} von ${rows.length}.`);
  }

  // Gleicht die Bindungen der Server von `shard` mit Discord ab, nach jeder
  // neuen Sitzung: Was Discord ausdrücklich als gelöscht führt, fällt weg, so
  // auch Erstattungen, während der Bot offline war; was nicht verbraucht ist,
  // verbraucht er. Fehlt ein Kauf in der Liste oder scheitert eine Seite,
  // bleibt die Bindung. Das Log nennt nur Zahlen.
  // Grenze: jeder Durchgang liest alle Käufe jeder gebundenen SKU, je Shard
  // einmal; bei vielen Shards je Prozess die Liste einmal lesen und für alle nutzen.
  // Siehe docs/schnittstelle/module.md, „Kauf binden“.
  async gleicheAb(shard: { id: number; anzahl: number }): Promise<void> {
    const { rows } = await this.o.db.query<{ entitlement: string; server: string; sku: string; verbraucht: boolean }>(
      `SELECT entitlement, server, sku, verbraucht FROM bindungen WHERE ${aufShards('$1', '$2')}`,
      [shard.anzahl, [shard.id]],
    );
    if (rows.length === 0) return;
    const offen = new Map(rows.map((z) => [z.entitlement, z]));
    let geloescht = 0;
    let verbraucht = 0;
    /* oxlint-disable no-await-in-loop */
    for (const sku of new Set(rows.map((z) => z.sku))) {
      try {
        for await (const seite of this.o.kaeufe.seitenDerSku(sku)) {
          for (const kauf of seite) {
            const z = offen.get(kauf.id);
            if (!z) continue;
            if (kauf.geloescht) {
              await this.o.db.query('DELETE FROM bindungen WHERE entitlement = $1', [kauf.id]);
              this.gebunden.delete(z.server);
              geloescht += 1;
            } else if (!z.verbraucht) {
              // Scheitert das Verbrauchen, bleibt die Bindung offen.
              if (!(await this.verbrauche(kauf).then(() => true, () => false))) continue;
              verbraucht += 1;
            }
            offen.delete(kauf.id);
          }
        }
      } catch (fehler) {
        // Die Liste bricht ab; die Bindungen, die noch fehlen, bleiben.
        console.error(`Käufe nicht abgeglichen: ${text(fehler)}`);
      }
    }
    /* oxlint-enable no-await-in-loop */
    console.log(`Käufe abgeglichen: ${rows.length} Bindungen, ${geloescht} gelöscht, ${verbraucht} nachverbraucht, ${offen.size} offen.`);
  }

  // Ein Ereignis von Discord leert den Server im Cache der Abos; ein
  // gelöschter Kauf beendet seine Bindung. Siehe docs/schnittstelle/module.md, „Kauf binden“.
  async ereignis(art: KaufEreignis, kauf: Kauf): Promise<void> {
    if (kauf.server) this.laufend.delete(kauf.server);
    if (art !== 'geloescht') return;
    const { rows } = await this.o.db.query<{ server: string }>('DELETE FROM bindungen WHERE entitlement = $1 RETURNING server', [kauf.id]);
    for (const { server } of rows) this.gebunden.delete(server);
  }

  // Trägt die Bindung ein; false, wenn der Kauf schon gebunden ist, etwa von
  // einer zweiten Anfrage zugleich. Hat der Server schon einen Kauf dieser
  // SKU, `schon_freigeschaltet`.
  private async trageEin(kauf: string, server: string, sku: string): Promise<boolean> {
    try {
      await this.o.db.query('INSERT INTO bindungen (entitlement, server, sku) VALUES ($1, $2, $3)', [kauf, server, sku]);
      return true;
    } catch (fehler) {
      if (!(fehler instanceof DatabaseError) || fehler.code !== '23505') throw fehler;
      if (fehler.constraint === 'bindungen_einmal') throw new BausteinFehler(400, 'schon_freigeschaltet');
      return false;
    }
  }

  // Verbraucht den Kauf bei Discord, wenn Discord ihn noch nicht als
  // verbraucht führt, und vermerkt es. Wirft `DiscordFehler`.
  private async verbrauche(kauf: Pick<Kauf, 'id' | 'verbraucht'>): Promise<void> {
    if (!kauf.verbraucht) await this.o.kaeufe.verbrauche(kauf.id);
    await this.o.db.query('UPDATE bindungen SET verbraucht = true WHERE entitlement = $1', [kauf.id]);
  }
}

// Discord liefert die Käufe nicht: 5xx nach den Wiederholungen, Abbruch.
function nichtErreichbar(fehler: unknown): never {
  console.error(`Kauf binden: ${text(fehler)}`);
  throw new BausteinFehler(503, 'nicht_erreichbar');
}
