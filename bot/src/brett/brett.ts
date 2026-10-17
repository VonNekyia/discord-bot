import type { Pool } from 'pg';
import { BausteinFehler, type Baustein, type Bereich, type Satz } from '../kern/baukasten.js';
import { ladeCache } from '../kern/cache.js';
import { istObjekt } from '../kern/eingabe.js';
import type { Modul } from '../kern/modul.js';
import type { Kontext } from '../discord/kontext.js';

// Das Board kennt von einem Modul nur Namen und Schalter.
export type BrettModul = Pick<Modul<unknown>, 'name' | 'schalter'>;

export interface BrettOptionen {
  db: Pick<Pool, 'query'>;
  // Alle Module, in der Reihenfolge der Tabs; auf dem Board stehen die mit Schalter.
  module: readonly BrettModul[];
  // Ob ein bezahltes Modul auf dem Server freigeschaltet ist; ohne Angabe nie.
  freigeschaltet?(server: string, modul: string): Promise<boolean>;
  // Der Link zum Kaufen eines bezahlten Moduls, in den Store von Discord.
  kaufen?(modul: string): string | undefined;
  // Der Cache der gespeicherten Schalter; ohne Angabe ein eigener. Tests geben einen.
  gespeichert?: { fetch(server: string): Promise<Map<string, boolean> | undefined>; delete(server: string): unknown };
}

const saetze: Record<string, Satz> = {
  nicht_freigeschaltet: { titel: 'Dieses Modul ist auf dem Server nicht freigeschaltet.', text: 'Schalte es im Store von Discord frei, dann geht es hier an.' },
};

// Die gespeicherten Schalter eines Servers, je Modul.
export async function liesSchalter(db: Pick<Pool, 'query'>, server: string): Promise<Map<string, boolean>> {
  const { rows } = await db.query<{ modul: string; an: boolean }>('SELECT modul, an FROM module_an WHERE server = $1', [server]);
  return new Map(rows.map((z) => [z.modul, z.an]));
}

// Das Board der Module: je Server, welches Modul an ist, und die Seite
// `module` im Dashboard. Kein Modul; es kennt die Module nur über ihren
// Schalter. Siehe docs/schnittstelle/module.md.
export class Brett {
  // Für Aufraeumen, wie ein Modul.
  readonly name = 'brett';
  readonly tabellen = ['module_an'] as const;
  readonly bereich: Bereich<Kontext>;
  private readonly gespeichert: NonNullable<BrettOptionen['gespeichert']>;
  private readonly schalter: (BrettModul & { schalter: NonNullable<BrettModul['schalter']> })[];

  constructor(private readonly o: BrettOptionen) {
    // Gelesen bei jedem Ereignis, Befehl und Knopf; wer speichert, löscht
    // den Server hier. Siehe docs/bot/cache.md, „Wann cachen“.
    this.gespeichert = o.gespeichert ?? ladeCache((server: string) => liesSchalter(o.db, server));
    this.schalter = o.module.flatMap((m) => (m.schalter ? [{ ...m, schalter: m.schalter }] : []));
    this.bereich = this.baueBereich();
  }

  private frei(server: string, modul: string): Promise<boolean> {
    return this.o.freigeschaltet?.(server, modul) ?? Promise.resolve(false);
  }

  // Ist das Modul `modul` auf dem Server an? Ohne Schalter immer.
  async istAn(modul: string, server: string): Promise<boolean> {
    const m = this.schalter.find((s) => s.name === modul);
    if (!m) return true;
    const an = (await this.gespeichert.fetch(server))?.get(modul) ?? !m.schalter.bezahlt;
    if (!an || !m.schalter.bezahlt) return an;
    return this.frei(server, modul);
  }

  // Vergisst den Server im Cache, wenn der Bot ihn verlässt.
  vergiss(server: string): void {
    this.gespeichert.delete(server);
  }

  // Je Modul mit Schalter, ob es an ist, und ob es freigeschaltet ist.
  private async stand(server: string): Promise<{ wert: Record<string, boolean>; frei: Map<string, boolean>; gespeichert: Map<string, boolean> }> {
    const gespeichert = (await this.gespeichert.fetch(server)) ?? new Map<string, boolean>();
    const frei = new Map<string, boolean>();
    await Promise.all(this.schalter.filter((m) => m.schalter.bezahlt).map(async (m) => frei.set(m.name, await this.frei(server, m.name))));
    return { wert: this.wertVon(gespeichert, frei), frei, gespeichert };
  }

  // Der Wert der Seite: ein bezahltes Modul ist nur freigeschaltet an.
  private wertVon(gespeichert: ReadonlyMap<string, boolean>, frei: ReadonlyMap<string, boolean>): Record<string, boolean> {
    return Object.fromEntries(
      this.schalter.map((m) => [m.name, (gespeichert.get(m.name) ?? !m.schalter.bezahlt) && (!m.schalter.bezahlt || frei.get(m.name) === true)]),
    );
  }

  private bausteine(frei: Map<string, boolean>): Baustein[] {
    const bausteine: Baustein[] = [
      {
        art: 'hinweis',
        id: 'hinweis',
        ton: 'info',
        satz: { titel: 'Was aus ist, tut nichts.', text: 'Ein Modul, das aus ist, reagiert auf dem Server nicht, und seine Tabs fehlen. Seine Einstellungen bleiben.' },
      },
    ];
    for (const m of this.schalter) {
      const gesperrt = m.schalter.bezahlt === true && frei.get(m.name) !== true;
      bausteine.push({
        art: 'schalter',
        id: m.name,
        titel: m.schalter.titel,
        hilfe: m.schalter.hilfe,
        ...(gesperrt ? { gesperrt: { grund: 'Noch nicht freigeschaltet.', code: 'nicht_freigeschaltet' } } : {}),
      });
      const url = gesperrt ? this.o.kaufen?.(m.name) : undefined;
      if (url) bausteine.push({ art: 'link', id: `${m.name}Kaufen`, titel: 'Freischalten im Store von Discord', url });
    }
    return bausteine;
  }

  private baueBereich(): Bereich<Kontext> {
    return {
      seiten: { module: {} },

      zeige: async ({ server }) => {
        const { wert, frei } = await this.stand(server.id);
        return [{ id: 'module', titel: 'Module', bausteine: this.bausteine(frei), daneben: [], wert, saetze, fund: null, alleNeu: true }];
      },

      // Ein bezahltes Modul, das nicht freigeschaltet ist, behält seinen
      // gespeicherten Schalter. Siehe docs/schnittstelle/module.md, „Schalter ohne Freischaltung“.
      speichere: async ({ server }, seite, eingabe) => {
        if (seite !== 'module') throw new BausteinFehler(404, 'nicht_gefunden');
        const { frei, gespeichert } = await this.stand(server.id);
        const offen = this.schalter.filter((m) => !m.schalter.bezahlt || frei.get(m.name) === true);
        if (!istObjekt(eingabe)) throw new BausteinFehler(400, 'ungueltig', offen[0]?.name);
        const neu: [string, boolean][] = [];
        for (const m of offen) {
          const an = eingabe[m.name];
          if (typeof an !== 'boolean') throw new BausteinFehler(400, 'ungueltig', m.name);
          neu.push([m.name, an]);
        }
        if (neu.length > 0) {
          await this.o.db.query(
            `INSERT INTO module_an (server, modul, an) SELECT $1, * FROM unnest($2::text[], $3::boolean[])
             ON CONFLICT (server, modul) DO UPDATE SET an = excluded.an`,
            [server.id, neu.map(([n]) => n), neu.map(([, an]) => an)],
          );
        }
        this.gespeichert.delete(server.id);
        const wert = this.wertVon(new Map([...gespeichert, ...neu]), frei);
        const an = Object.values(wert).filter(Boolean).length;
        return { wert, meldung: { titel: 'Gespeichert.', text: `${an} von ${this.schalter.length} Modulen ${an === 1 ? 'ist' : 'sind'} an.` } };
      },
    };
  }
}
