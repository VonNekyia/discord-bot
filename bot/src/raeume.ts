import {
  ChannelType,
  DiscordAPIError,
  OverwriteType,
  PermissionFlagsBits as R,
  RESTJSONErrorCodes,
  type CategoryChannel,
  type Guild,
} from 'discord.js';
import type { Pool } from 'pg';
import { text as fehlertext } from './befehle.js';
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
  return (
    fehler instanceof DiscordAPIError &&
    (fehler.code === RESTJSONErrorCodes.TargetUserIsNotConnectedToVoice || fehler.code === RESTJSONErrorCodes.UnknownChannel)
  );
}

// Wer in einem Kanal ist, aus den Voice States, nicht aus dem Cache der
// Mitglieder; der hält nur den Bot. Siehe docs/bot/sprachraeume-bau.md, „Belegung“.
export function belegung(guild: Guild, kanal: string): string[] {
  return [...guild.voiceStates.cache.values()].filter((s) => s.channelId === kanal).map((s) => s.id);
}

// Die Einträge der Kategorie, dazu Besitzer und Bot; für dieselbe ID
// zusammengeführt, unsere Rechte erlaubt. Siehe docs/benutzung/sprachraeume.md, „Ablauf“.
export function eintraege(kategorie: CategoryChannel | undefined, besitzer: string, bot: string) {
  const liste = new Map<string, { id: string; type: OverwriteType; allow: bigint; deny: bigint }>();
  for (const e of kategorie?.permissionOverwrites.cache.values() ?? []) {
    liste.set(e.id, { id: e.id, type: e.type, allow: e.allow.bitfield, deny: e.deny.bitfield });
  }
  const dazu = (id: string, rechte: bigint) => {
    const alt = liste.get(id) ?? { id, type: OverwriteType.Member, allow: 0n, deny: 0n };
    liste.set(id, { ...alt, allow: alt.allow | rechte, deny: alt.deny & ~rechte });
  };
  dazu(besitzer, R.ViewChannel | R.Connect | R.ReadMessageHistory);
  dazu(bot, R.ViewChannel | R.Connect | R.SendMessages);
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

export async function istRaum(db: Pick<Pool, 'query'>, kanal: string): Promise<boolean> {
  return ((await db.query('SELECT 1 FROM raeume WHERE kanal = $1', [kanal])).rowCount ?? 0) > 0;
}

export async function vergissRaum(db: Pick<Pool, 'query'>, kanal: string): Promise<void> {
  await db.query('DELETE FROM raeume WHERE kanal = $1', [kanal]);
}

// Räume auf Zeit: anlegen, verschieben, leere löschen.
// Siehe docs/benutzung/sprachraeume.md und docs/bot/sprachraeume-bau.md.
export class Raeume {
  // Je `<Server>/<Mitglied>` die Zeit des letzten neuen Raums; ein Timer
  // vergisst sie nach `abstand`. Siehe docs/bot/datenschutz.md, „Was der Bot speichert“.
  private readonly letzteAnlage = new Map<string, { zeit: number; uhr: ReturnType<typeof setTimeout> }>();
  private readonly ketten = new Map<string, Promise<void>>();
  // Je Raum der Timer bis zum Löschen und wer darauf wartet.
  private readonly loeschUhren = new Map<string, { uhr: ReturnType<typeof setTimeout>; fertig: () => void }>();
  private readonly uhr: () => number;
  private readonly warten: number;
  private readonly abstand: number;

  constructor(private readonly k: RaumKontext) {
    this.uhr = k.uhr ?? (() => Date.now());
    this.warten = k.warten ?? 2_000;
    this.abstand = k.abstand ?? 30_000;
  }

  // Wie viele Mitglieder die Grenze von 30 s gerade kennt; für Tests.
  get gemerkt(): number {
    return this.letzteAnlage.size;
  }

  private merke(schluessel: string): void {
    clearTimeout(this.letzteAnlage.get(schluessel)?.uhr);
    const uhr = setTimeout(() => this.letzteAnlage.delete(schluessel), this.abstand);
    uhr.unref?.();
    this.letzteAnlage.set(schluessel, { zeit: this.uhr(), uhr });
  }

  // Aus `voiceStateUpdate`: `vorher` und `nachher` sind Kanal-IDs oder null.
  // Gibt zurück, wenn alles, was es auslöst, fertig ist; für Tests.
  async aenderung(guild: Guild, nutzer: string, vorher: string | null, nachher: string | null): Promise<void> {
    if (vorher === nachher) return;
    const arbeit: Promise<void>[] = [];
    if (vorher) arbeit.push(this.vielleichtLeer(guild, vorher));
    if (nachher) arbeit.push(this.nacheinander(`${guild.id}/${nutzer}`, () => this.betreten(guild, nutzer, nachher)));
    await Promise.all(arbeit);
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

  private async betreten(guild: Guild, nutzer: string, kanal: string): Promise<void> {
    const s = await this.k.einstellungen.fetch(guild.id);
    const erzeuger = s?.an ? s.erzeuger.find((e) => e.kanal === kanal) : undefined;
    if (!erzeuger) return;

    const eigener = await raumVon(this.k.db, guild.id, nutzer);
    if (eigener && guild.channels.cache.has(eigener)) {
      await guild.members.edit(nutzer, { channel: eigener, reason: grund.verschoben }).catch((fehler: unknown) => {
        if (!erwartet(fehler)) console.error(`Sprachraum: nicht zurückverschoben: ${fehlertext(fehler)}`);
      });
      return;
    }
    if (eigener) await vergissRaum(this.k.db, eigener);

    // Höchstens ein neuer Raum je 30 s und Mitglied; sonst bleibt es im Erzeuger.
    const schluessel = `${guild.id}/${nutzer}`;
    const zuletzt = this.letzteAnlage.get(schluessel)?.zeit;
    if (zuletzt !== undefined && this.uhr() - zuletzt < this.abstand) return;

    const ich = guild.members.me;
    const erzeugerKanal = guild.channels.cache.get(kanal);
    if (!ich || !erzeugerKanal) return;
    const kategorieId = erzeuger.kategorie ?? erzeugerKanal.parentId;
    const kategorie = kategorieId ? guild.channels.cache.get(kategorieId) : undefined;
    const mitglied = await guild.members.fetch({ user: nutzer, force: true });

    let raum;
    try {
      raum = await guild.channels.create({
        name: erzeuger.name.replaceAll('{name}', mitglied.displayName).slice(0, 100),
        type: ChannelType.GuildVoice,
        parent: kategorie?.type === ChannelType.GuildCategory ? kategorie.id : null,
        userLimit: erzeuger.limit,
        permissionOverwrites: eintraege(kategorie?.type === ChannelType.GuildCategory ? kategorie : undefined, nutzer, ich.id),
        reason: grund.angelegt,
      });
    } catch (fehler) {
      console.error(`Sprachraum: nicht angelegt: ${fehlertext(fehler)}`);
      return;
    }
    this.merke(schluessel);
    try {
      await this.k.db.query('INSERT INTO raeume (kanal, server, besitzer) VALUES ($1, $2, $3)', [raum.id, guild.id, nutzer]);
      await guild.members.edit(nutzer, { channel: raum.id, reason: grund.angelegt });
    } catch (fehler) {
      // Das Mitglied ist schon weg, oder es hat inzwischen einen Raum: Der neue geht wieder.
      if (!erwartet(fehler)) console.error(`Sprachraum: nicht verschoben: ${fehlertext(fehler)}`);
      await this.loesche(guild, raum.id, grund.gescheitert);
    }
  }

  // Ist ein Raum leer, prüft der Bot nach `warten` ms noch einmal und löscht ihn dann.
  private async vielleichtLeer(guild: Guild, kanal: string): Promise<void> {
    if (belegung(guild, kanal).length > 0 || !(await istRaum(this.k.db, kanal))) return;
    this.halteAn(kanal);
    await new Promise<void>((fertig) => {
      const uhr = setTimeout(() => {
        this.loeschUhren.delete(kanal);
        if (belegung(guild, kanal).length > 0) return fertig();
        void this.loesche(guild, kanal, grund.leer).finally(fertig);
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

  private async loesche(guild: Guild, kanal: string, warum: string): Promise<void> {
    await vergissRaum(this.k.db, kanal);
    await guild.channels.delete(kanal, warum).catch((fehler: unknown) => {
      if (!erwartet(fehler)) console.error(`Sprachraum: nicht gelöscht: ${fehlertext(fehler)}`);
    });
  }

  // Wird ein Kanal gelöscht, auch von Hand, vergisst der Bot den Raum.
  async geloescht(kanal: string): Promise<void> {
    this.halteAn(kanal);
    await vergissRaum(this.k.db, kanal);
  }

  // Beim Start: Räume ohne Kanal vergessen, leere löschen. Nur für Server in
  // `guilds`, also die Shards dieses Prozesses. Siehe docs/bot/sprachraeume-bau.md, „Abgleich beim Start“.
  async gleicheAb(guilds: Iterable<Guild>): Promise<void> {
    for (const guild of guilds) {
      const { rows } = await this.k.db.query<{ kanal: string }>('SELECT kanal FROM raeume WHERE server = $1', [guild.id]);
      for (const { kanal } of rows) {
        if (!guild.channels.cache.has(kanal)) await vergissRaum(this.k.db, kanal);
        else if (belegung(guild, kanal).length === 0) await this.loesche(guild, kanal, grund.leer);
      }
    }
  }
}
