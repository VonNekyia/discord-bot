import type { Pool } from 'pg';
import { DiscordFehler } from '../../discord/fehler.js';
import type { Server } from '../../discord/server.js';
import {
  belegung,
  bot,
  eintraegeVon,
  hatKanal,
  holeMitglied,
  kategorieVon,
  legeSprachkanalAn,
  loescheKanal,
  sendeMenue,
  verschiebe,
} from '../../discord/sprachkanaele.js';
import type { Mitglied } from '../../discord/nachrichten.js';
import { text as fehlertext } from '../../kern/fehler.js';
import { nameOder, ohneHasszeichen } from '../../kern/namen.js';
import { menue } from './menue.js';
import { besitzerRechte, botRechte, erlaube, type Eintrag } from './raumrechte.js';
import type { Sprachraeume } from './sprachraeume.js';

// Was `Raeume` braucht. `uhr` und die Zeiten sind nur für Tests anders.
// Siehe docs/bot/sprachraeume-bau.md.
export interface RaumKontext {
  db: Pick<Pool, 'query'>;
  einstellungen: { fetch(server: string): Promise<Sprachraeume | undefined> };
  uhr?: () => number;
  // Wie lange ein leerer Raum stehen bleibt, bevor der Bot neu prüft, in ms.
  warten?: number;
  // Wie lange ein Mitglied auf einen neuen Raum wartet, in ms.
  abstand?: number;
  // Plant `fn` nach `ms` und gibt zurück, wie man es abbricht; für das
  // Vergessen nach `abstand`. In Tests eine falsche Uhr: Mit falschem
  // `setTimeout` für den ganzen Prozess hängt REST. Siehe docs/entwicklung/tests.md, „Falsche Uhren“.
  planen?: (fn: () => void, ms: number) => () => void;
}

function planeEcht(fn: () => void, ms: number): () => void {
  const uhr = setTimeout(fn, ms);
  uhr.unref?.();
  return () => clearTimeout(uhr);
}

// Feste Gründe im Audit-Log, ohne IDs und Namen.
// Siehe docs/benutzung/sprachraeume.md, „Rechte und Intent“.
const grund = {
  angelegt: 'Sprachraum angelegt',
  leer: 'Sprachraum leer',
  verschoben: 'Sprachraum: in den eigenen Raum',
  gescheitert: 'Sprachraum: Verschieben gescheitert',
} as const;

// Fehler von Discord, die zum Ablauf gehören: Das Mitglied ist nicht mehr
// verbunden (40032), oder der Kanal ist schon weg (10003).
function erwartet(fehler: unknown): boolean {
  return fehler instanceof DiscordFehler && (fehler.code === 'nicht_verbunden' || fehler.code === 'nicht_gefunden');
}

// Die Einträge der Kategorie, dazu Besitzer und Bot; für dieselbe ID
// zusammengeführt, unsere Rechte erlaubt. Siehe docs/benutzung/sprachraeume.md, „Ablauf“.
export function eintraege(kategorie: Eintrag[] | undefined, besitzer: string, ich: string): Eintrag[] {
  const liste = new Map<string, Eintrag>();
  for (const e of kategorie ?? []) liste.set(e.id, { ...e });
  erlaube(liste, besitzer, 'person', besitzerRechte);
  erlaube(liste, ich, 'person', botRechte);
  return [...liste.values()];
}

export async function raumVon(db: Pick<Pool, 'query'>, server: string, besitzer: string): Promise<string | undefined> {
  const { rows } = await db.query<{ kanal: string }>('SELECT kanal FROM raeume WHERE server = $1 AND besitzer = $2', [server, besitzer]);
  return rows[0]?.kanal;
}

// Die Kanäle aller Räume eines Servers.
export async function raeumeVon(db: Pick<Pool, 'query'>, server: string): Promise<Set<string>> {
  const { rows } = await db.query<{ kanal: string }>('SELECT kanal FROM raeume WHERE server = $1', [server]);
  return new Set(rows.map((z) => z.kanal));
}

export async function besitzerVon(db: Pick<Pool, 'query'>, kanal: string): Promise<string | undefined> {
  const { rows } = await db.query<{ besitzer: string }>('SELECT besitzer FROM raeume WHERE kanal = $1', [kanal]);
  return rows[0]?.besitzer;
}

export async function istRaum(db: Pick<Pool, 'query'>, kanal: string): Promise<boolean> {
  return ((await db.query('SELECT 1 FROM raeume WHERE kanal = $1', [kanal])).rowCount ?? 0) > 0;
}

export async function vergissRaum(db: Pick<Pool, 'query'>, kanal: string): Promise<void> {
  await db.query('DELETE FROM raeume WHERE kanal = $1', [kanal]);
}

// Räume auf Zeit: anlegen, verschieben, leere löschen.
// Siehe docs/benutzung/sprachraeume.md und docs/bot/sprachraeume-bau.md.
// Der Name eines neuen Raums: die Vorlage mit dem Namen des Besitzers für
// `{name}`, höchstens 100 Zeichen. Der Bot schreibt keine Hasszeichen, weder
// aus dem Namen noch aus der Vorlage; bleibt vom Namen nichts, nimmt er den
// Benutzernamen, bleibt vom Raumnamen nichts, den Namen.
// Siehe docs/benutzung/sprachraeume.md, „Namensvorlage“.
export function raumname(vorlage: string, mitglied: Pick<Mitglied, 'name' | 'benutzername'>): string {
  const name = nameOder(ohneHasszeichen(mitglied.name), mitglied.benutzername);
  return nameOder(ohneHasszeichen(vorlage.replaceAll('{name}', name)), name).slice(0, 100);
}

export class Raeume {
  // Je `<Server>/<Mitglied>` die Zeit des letzten neuen Raums; ein Timer
  // vergisst sie nach `abstand`. Siehe docs/bot/datenschutz.md, „Was der Bot speichert“.
  private readonly letzteAnlage = new Map<string, { zeit: number; abbrechen: () => void }>();
  private readonly ketten = new Map<string, Promise<void>>();
  // Je Raum der Timer bis zum Löschen und wer darauf wartet.
  private readonly loeschUhren = new Map<string, { uhr: ReturnType<typeof setTimeout>; fertig: () => void }>();
  private readonly uhr: () => number;
  private readonly warten: number;
  private readonly abstand: number;
  private readonly planen: (fn: () => void, ms: number) => () => void;

  constructor(private readonly k: RaumKontext) {
    this.uhr = k.uhr ?? (() => Date.now());
    this.warten = k.warten ?? 2_000;
    this.abstand = k.abstand ?? 30_000;
    this.planen = k.planen ?? planeEcht;
  }

  // Wie viele Mitglieder die Grenze von 30 s gerade kennt; für Tests.
  get gemerkt(): number {
    return this.letzteAnlage.size;
  }

  private merke(schluessel: string): void {
    this.letzteAnlage.get(schluessel)?.abbrechen();
    const abbrechen = this.planen(() => this.letzteAnlage.delete(schluessel), this.abstand);
    this.letzteAnlage.set(schluessel, { zeit: this.uhr(), abbrechen });
  }

  // Aus `voiceStateUpdate`: `vorher` und `nachher` sind Kanal-IDs oder null.
  // Gibt zurück, wenn alles, was es auslöst, fertig ist; für Tests.
  async aenderung(server: Server, nutzer: string, vorher: string | null, nachher: string | null): Promise<void> {
    await Promise.all([this.geht(server, vorher, nachher), this.kommt(server, nutzer, vorher, nachher)]);
  }

  // Der Teil, der aufräumt: Ist `vorher` ein Raum und jetzt leer, geht er.
  // Läuft auch, wenn das Modul auf dem Server aus ist.
  // Siehe docs/schnittstelle/module.md, „Ein Modul ist aus“.
  async geht(server: Server, vorher: string | null, nachher: string | null): Promise<void> {
    if (vorher && vorher !== nachher) await this.vielleichtLeer(server, vorher);
  }

  // Der Teil, der Räume anlegt: Betritt das Mitglied einen Erzeuger, bekommt es einen.
  async kommt(server: Server, nutzer: string, vorher: string | null, nachher: string | null): Promise<void> {
    if (nachher && vorher !== nachher) await this.nacheinander(`${server.id}/${nutzer}`, () => this.betreten(server, nutzer, nachher));
  }

  // Ein Mitglied nach dem anderen: Zwei schnelle Beitritte legen nicht zwei Räume an.
  private nacheinander(schluessel: string, aufgabe: () => Promise<void>): Promise<void> {
    const davor = this.ketten.get(schluessel) ?? Promise.resolve();
    const diese = davor.then(aufgabe).catch((fehler: unknown) => console.error(`Sprachraum: ${fehlertext(fehler)}`));
    this.ketten.set(schluessel, diese);
    void diese.finally(() => {
      if (this.ketten.get(schluessel) === diese) this.ketten.delete(schluessel);
    });
    return diese;
  }

  private async betreten(server: Server, nutzer: string, kanal: string): Promise<void> {
    const s = await this.k.einstellungen.fetch(server.id);
    const erzeuger = s?.an ? s.erzeuger.find((e) => e.kanal === kanal) : undefined;
    if (!erzeuger) return;

    const eigener = await raumVon(this.k.db, server.id, nutzer);
    if (eigener && hatKanal(server, eigener)) {
      await verschiebe(server, nutzer, eigener, grund.verschoben).catch((fehler: unknown) => {
        if (!erwartet(fehler)) console.error(`Sprachraum: nicht zurückverschoben: ${fehlertext(fehler)}`);
      });
      return;
    }
    if (eigener) await vergissRaum(this.k.db, eigener);

    // Höchstens ein neuer Raum je 30 s und Mitglied; sonst bleibt es im Erzeuger.
    const schluessel = `${server.id}/${nutzer}`;
    const zuletzt = this.letzteAnlage.get(schluessel)?.zeit;
    if (zuletzt !== undefined && this.uhr() - zuletzt < this.abstand) return;

    const ich = bot(server);
    if (!ich || !hatKanal(server, kanal)) return;
    // Die eingestellte Kategorie, sonst die des Erzeugers; ist es keine, ohne Kategorie.
    const kategorieId = erzeuger.kategorie ?? kategorieVon(server, kanal);
    const kategorie = kategorieId ? eintraegeVon(server, kategorieId) : undefined;
    const mitglied = await holeMitglied(server, nutzer);

    let raum;
    try {
      raum = await legeSprachkanalAn(server, {
        name: raumname(erzeuger.name, mitglied),
        kategorie: kategorie ? kategorieId : null,
        limit: erzeuger.limit,
        eintraege: eintraege(kategorie, nutzer, ich),
        grund: grund.angelegt,
      });
    } catch (fehler) {
      console.error(`Sprachraum: nicht angelegt: ${fehlertext(fehler)}`);
      return;
    }
    this.merke(schluessel);
    try {
      await this.k.db.query('INSERT INTO raeume (kanal, server, besitzer) VALUES ($1, $2, $3)', [raum, server.id, nutzer]);
      await verschiebe(server, nutzer, raum, grund.angelegt);
    } catch (fehler) {
      // Das Mitglied ist schon weg, oder es hat inzwischen einen Raum: Der neue geht wieder.
      if (!erwartet(fehler)) console.error(`Sprachraum: nicht verschoben: ${fehlertext(fehler)}`);
      await this.loesche(server, raum, grund.gescheitert);
      return;
    }
    // Das Menü im Textchat des Raums. Scheitert es, bleibt der Raum ohne Knöpfe.
    // Siehe docs/benutzung/sprachraeume.md, „Wenn etwas fehlt“.
    await sendeMenue(server, raum, menue()).catch((fehler: unknown) => {
      if (!erwartet(fehler)) console.error(`Sprachraum: Menü nicht gesendet: ${fehlertext(fehler)}`);
    });
  }

  // Ist ein Raum leer, prüft der Bot nach `warten` ms noch einmal und löscht ihn dann.
  private async vielleichtLeer(server: Server, kanal: string): Promise<void> {
    if (belegung(server, kanal).length > 0 || !(await istRaum(this.k.db, kanal))) return;
    this.halteAn(kanal);
    await new Promise<void>((fertig) => {
      const uhr = setTimeout(() => {
        this.loeschUhren.delete(kanal);
        if (belegung(server, kanal).length > 0) return fertig();
        void this.loesche(server, kanal, grund.leer).finally(fertig);
      }, this.warten);
      this.loeschUhren.set(kanal, { uhr, fertig });
    });
  }

  // Bricht ein geplantes Löschen ab.
  private halteAn(kanal: string): void {
    const geplant = this.loeschUhren.get(kanal);
    if (!geplant) return;
    clearTimeout(geplant.uhr);
    this.loeschUhren.delete(kanal);
    geplant.fertig();
  }

  private async loesche(server: Server, kanal: string, warum: string): Promise<void> {
    await vergissRaum(this.k.db, kanal);
    await loescheKanal(server, kanal, warum).catch((fehler: unknown) => {
      if (!erwartet(fehler)) console.error(`Sprachraum: nicht gelöscht: ${fehlertext(fehler)}`);
    });
  }

  // Wird ein Kanal gelöscht, auch von Hand, vergisst der Bot den Raum.
  async geloescht(kanal: string): Promise<void> {
    this.halteAn(kanal);
    await vergissRaum(this.k.db, kanal);
  }

  // Beim Start: Räume ohne Kanal vergessen, leere löschen. Nur für Server in
  // `server`, also die Shards dieses Prozesses. Siehe docs/bot/sprachraeume-bau.md, „Abgleich beim Start“.
  async gleicheAb(alle: Iterable<Server>): Promise<void> {
    // Server für Server, Raum für Raum.
    /* oxlint-disable no-await-in-loop */
    for (const server of alle) {
      const { rows } = await this.k.db.query<{ kanal: string }>('SELECT kanal FROM raeume WHERE server = $1', [server.id]);
      for (const { kanal } of rows) {
        if (!hatKanal(server, kanal)) await vergissRaum(this.k.db, kanal);
        else if (belegung(server, kanal).length === 0) await this.loesche(server, kanal, grund.leer);
      }
    }
    /* oxlint-enable no-await-in-loop */
  }
}
