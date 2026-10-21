import type { Pool } from 'pg';
import { text } from '../../kern/fehler.js';
import { ohneHasszeichen } from '../../kern/namen.js';
import { fehlgeschlagen, type Befehl, type Ort, type Vorschlag, type Ziel } from '../../discord/befehle.js';
import { DiscordFehler } from '../../discord/fehler.js';
import type { Druck } from '../../discord/interaktionen.js';
import type { Formular } from '../../discord/menue.js';
import type { Person, Rang } from '../../discord/mitglieder.js';
import type { Server } from '../../discord/server.js';
import { bannDm, eigenerGrund, type Strafen } from './strafen.js';

// Was die Befehle von Discord brauchen; im Bot aus bot/src/discord/moderation.ts.
export interface Werkzeuge {
  zielAuf(server: Server, id: string): Promise<Ziel | undefined>;
  botAuf(server: Server): { id: string; rang: Rang; bannen: boolean; kicken: boolean } | undefined;
  banne(server: Server, id: string, grund: string): Promise<void>;
  kicke(server: Server, id: string, grund: string): Promise<void>;
  schreibe(server: Server, id: string, inhalt: string): Promise<void>;
}

export interface StrafenKontext {
  db: Pick<Pool, 'query'>;
  einstellungen: { fetch(server: string): Promise<Strafen | undefined> };
  w: Werkzeuge;
  // Die Uhr in ms; in Tests eine falsche.
  uhr?: () => number;
}

export type Art = 'ban' | 'kick' | 'warn';

// Das Präfix der Formulare für den eigenen Grund: `strafe:<art>:<ID des Ziels>`.
export const praefix = 'strafe:';

const sieben = 7 * 24 * 60 * 60 * 1000;
const tag = 24 * 60 * 60 * 1000;

const wort: Record<Art, { tat: string; viele: string }> = {
  ban: { tat: 'gebannt', viele: 'Bans' },
  kick: { tat: 'gekickt', viele: 'Kicks' },
  warn: { tat: 'verwarnt', viele: 'Verwarnungen' },
};

// Ein Fall: wer was mit wem warum tut.
type Fall = { art: Art; server: Server; wer: Person; rang: Rang; ziel: Ziel; grund: string };

const zeitstempel = (ms: number) => `<t:${Math.ceil(ms / 1000)}:R>`;

// Darf `rang` die Befehle nutzen: Eigentümer, Administrator oder eine Rolle
// aus der Liste. Siehe docs/benutzung/managed-commands.md, „Wer darf“.
function darf(s: Strafen, rang: Rang): boolean {
  return rang.eigentuemer || rang.admin || s.limits.some((l) => rang.rollen.includes(l.rolle));
}

// Wie eine DM ausging, und der Satz dazu in der Antwort.
// Siehe docs/benutzung/managed-commands.md, „Antworten“.
type DmAusgang = 'angekommen' | 'kein_dm' | 'fehler';
const dmSatz: Record<DmAusgang, string> = {
  angekommen: 'Die DM ist angekommen.',
  kein_dm: 'Die DM kam nicht an; das Mitglied nimmt keine DMs von kitty an.',
  fehler: 'Die DM kam nicht an.',
};
// Scheitert der Bann, nachdem die DM ankam: Das Mitglied hat sie schon.
const dmSchon = 'Die DM an das Mitglied kam schon an.';

// Die Formulare für den eigenen Grund. Ein Formular muss die erste Antwort
// sein. Siehe docs/benutzung/managed-commands.md, „Grund“.
export function grundFormular(art: Art, ziel: string): Formular {
  return {
    id: `${praefix}${art}:${ziel}`,
    titel: 'Eigener Grund',
    feld: { id: 'wert', label: 'Grund', beschreibung: 'Steht im Audit-Log und in der DM.', min: 1, max: 400, wert: '' },
  };
}

// Die Befehle /ban, /kick und /warn, und das Formular für den eigenen Grund.
// Siehe docs/benutzung/managed-commands.md.
export class Strafbefehle {
  // Je `<Server>/<Mitglied>` die Kette der Befehle, die zählen; im Speicher,
  // weil jeder Server nur von einem Prozess bedient wird. Bei Bann und Kick
  // ist das Mitglied, wer den Befehl nutzt; die Kette deckt Zählen, DM, Bann
  // oder Kick und Eintragen ab. Bei /warn ist es das Ziel; die Kette deckt
  // DM, Eintragen und Zählen ab, damit „zum n. Mal“ nie zweimal gleich lautet.
  // ponytail: Sperre nur in diesem Prozess; bedienen einmal zwei Prozesse
  // denselben Server, eine Sperre in PostgreSQL (pg_advisory_xact_lock).
  // Siehe docs/benutzung/managed-commands.md, „Limit“.
  private readonly ketten = new Map<string, Promise<unknown>>();
  private readonly uhr: () => number;

  constructor(private readonly k: StrafenKontext) {
    this.uhr = k.uhr ?? (() => Date.now());
  }

  // Die Vorschläge: Gründe, die den Text enthalten, höchstens 24, dazu
  // „Eigener Grund …“. Nur für den, der die Befehle nutzen darf; sonst keine.
  async vorschlaege(eingabe: string, ort: Ort): Promise<Vorschlag[]> {
    const s = await this.k.einstellungen.fetch(ort.server.id);
    if (!s || !darf(s, ort.rang)) return [];
    const gesucht = eingabe.trim().toLowerCase();
    const passend = (s?.gruende ?? []).filter((g) => g.text.toLowerCase().includes(gesucht)).slice(0, 24);
    return [...passend.map((g) => ({ name: g.text, wert: g.text })), { name: 'Eigener Grund …', wert: eigenerGrund }];
  }

  befehle(): Befehl[] {
    const beschreibung: Record<Art, [string, string]> = {
      ban: ['Bannt ein Mitglied, mit Grund.', 'Wen kitty bannt.'],
      kick: ['Kickt ein Mitglied, mit Grund.', 'Wen kitty kickt.'],
      warn: ['Verwarnt ein Mitglied per DM, mit Grund.', 'Wen kitty verwarnt.'],
    };
    return (['ban', 'kick', 'warn'] as const).map((art) => ({
      name: art,
      beschreibung: beschreibung[art][0],
      nurServer: true,
      optionen: [
        { art: 'nutzer', name: 'nutzer', beschreibung: beschreibung[art][1] },
        { art: 'text', name: 'grund', beschreibung: 'Ein Grund aus der Liste oder ein eigener.', hoechstens: 400, vorschlaege: (e, ort) => this.vorschlaege(e, ort) },
      ],
      ausfuehren: async (a) => {
        const ziel = a.ziel('nutzer');
        if (!a.ort || !ziel) return a.antworte('Das geht nur auf einem Server.');
        const grund = (a.text('grund') ?? '').trim();
        if (grund.toLowerCase() === eigenerGrund) return a.zeigeFormular(grundFormular(art, ziel.person.id));
        await a.warte();
        await a.fertig(await this.fuehreAus({ art, ...a.ort, ziel, grund }));
      },
    }));
  }

  // Das abgeschickte Formular für den eigenen Grund.
  async formular(d: Druck): Promise<void> {
    const [art, id] = d.aktion.split(':');
    if (d.art !== 'formular' || (art !== 'ban' && art !== 'kick' && art !== 'warn') || !id) return;
    try {
      await d.warte();
      const ziel = await this.k.w.zielAuf(d.server, id);
      const antwort = ziel
        ? await this.fuehreAus({ art, server: d.server, wer: d.wer, rang: d.rang, ziel, grund: (d.wert ?? '').trim() })
        : 'Diesen Nutzer gibt es auf dem Server nicht mehr.';
      await d.fertig(antwort);
    } catch (fehler) {
      console.error(`/${art}: ${text(fehler)}`);
      const senden = d.beantwortet ? d.fertig(fehlgeschlagen) : d.antworte(fehlgeschlagen);
      await senden.catch((e: unknown) => console.error(`/${art}: Antwort fehlgeschlagen: ${text(e)}`));
    }
  }

  // Eins nach dem anderen je Mitglied und Server: Zwei Befehle zugleich
  // kommen nicht am Limit vorbei.
  private nacheinander<T>(schluessel: string, aufgabe: () => Promise<T>): Promise<T> {
    const davor = this.ketten.get(schluessel) ?? Promise.resolve();
    const diese = davor.then(aufgabe, aufgabe);
    this.ketten.set(schluessel, diese);
    void diese.finally(() => {
      if (this.ketten.get(schluessel) === diese) this.ketten.delete(schluessel);
    }).catch(() => {});
    return diese;
  }

  // Prüft und führt aus; gibt die Antwort an den, der den Befehl nutzt.
  // Die Sätze stehen auf derselben Seite unter „Antworten“. Hakenkreuze und
  // SS-Runen schreibt der Bot nie, auch nicht aus Name oder Grund; der Filter
  // läuft auf der fertigen Antwort, wie auf DM und Audit-Log.
  // Siehe docs/benutzung/managed-commands.md, „Ablauf“, und
  // docs/entscheidungen/0018-zierbuchstaben-und-filter.md.
  async fuehreAus(f: Fall): Promise<string> {
    return ohneHasszeichen(await this.entscheide(f));
  }

  private async entscheide(f: Fall): Promise<string> {
    if (f.grund === '') return 'Der Grund fehlt.';
    const s = await this.k.einstellungen.fetch(f.server.id);
    if (!s) throw new Error('keine Einstellungen');
    const unbegrenzt = f.rang.eigentuemer || f.rang.admin;
    const eigene = s.limits.filter((l) => f.rang.rollen.includes(l.rolle));
    if (!darf(s, f.rang)) return 'Du darfst diesen Befehl hier nicht nutzen.';

    const bot = this.k.w.botAuf(f.server);
    const nein = this.zielGehtNicht(f, bot);
    if (nein) return nein;
    if (f.art === 'warn') return this.nacheinander(`${f.server.id}/${f.ziel.person.id}`, () => this.verwarne(f, s));
    if (!(f.art === 'ban' ? bot?.bannen : bot?.kicken)) return 'kitty fehlt das Recht dazu, oder die Rolle von kitty steht zu tief.';

    const art = f.art;
    const limit = unbegrenzt ? undefined : Math.max(...eigene.map((l) => (art === 'ban' ? l.bans : l.kicks)));
    return this.nacheinander(`${f.server.id}/${f.wer.id}`, async () => {
      const jetzt = this.uhr();
      const { rows } = await this.k.db.query<{ zahl: number; erste: Date | null }>(
        `SELECT count(*)::int AS zahl, min(zeit) AS erste FROM strafaktionen
         WHERE server = $1 AND moderator = $2 AND art = $3 AND zeit > $4`,
        [f.server.id, f.wer.id, art, new Date(jetzt - sieben)],
      );
      const zahl = rows[0]?.zahl ?? 0;
      if (limit !== undefined && zahl >= limit) {
        if (limit === 0) return `Deine Rollen dürfen nicht ${art === 'ban' ? 'bannen' : 'kicken'}.`;
        const frei = (rows[0]?.erste?.getTime() ?? jetzt) + sieben;
        return `Du hast dein Limit erreicht: ${limit} ${wort[art].viele} in 7 Tagen. Der nächste geht ab ${zeitstempel(frei)}.`;
      }
      const dm = art === 'ban' && s.dm && f.ziel.rang ? await this.dm(f, bannDm(s, f.server.name, f.grund)) : undefined;
      let fehler: string | undefined;
      try {
        fehler = await this.tue(f, art);
      } catch (e) {
        // Ohne DM wie jeder andere Fehler; nach der DM sagt die Antwort, dass sie schon ankam.
        if (dm !== 'angekommen') throw e;
        console.error(`/${art}: ${text(e)}`);
        fehler = fehlgeschlagen;
      }
      if (fehler) return dm === 'angekommen' ? `${fehler} ${dmSchon}` : fehler;
      await this.k.db.query('INSERT INTO strafaktionen (server, moderator, art, zeit) VALUES ($1, $2, $3, $4)', [f.server.id, f.wer.id, art, new Date(jetzt)]);
      const teile = [`${f.ziel.person.name} ist ${wort[art].tat}. Grund: ${f.grund}.`];
      if (dm !== undefined) teile.push(dmSatz[dm]);
      if (limit !== undefined) teile.push(`${wort[art].viele} in 7 Tagen: ${zahl + 1} von ${limit}.`);
      return teile.join(' ');
    });
  }

  // Ein Satz, wenn das Ziel nicht geht; sonst undefined.
  // Siehe docs/benutzung/managed-commands.md, „Ziel“.
  private zielGehtNicht(f: Fall, bot: ReturnType<Werkzeuge['botAuf']>): string | undefined {
    const { person, rang } = f.ziel;
    if (person.id === f.wer.id) return 'Dich selbst kannst du nicht treffen.';
    if (bot && person.id === bot.id) return 'kitty kann sich nicht selbst treffen.';
    if (rang?.eigentuemer) return 'Den Eigentümer des Servers kann niemand treffen.';
    if (!rang && f.art !== 'ban') return `${person.name} ist nicht auf dem Server.`;
    if (rang && !f.rang.eigentuemer && rang.hoechste >= f.rang.hoechste) return `${person.name} steht so hoch wie du oder höher.`;
    if (rang && f.art !== 'warn' && bot && rang.hoechste >= bot.rang.hoechste) return `Die Rolle von kitty steht nicht über ${person.name}.`;
    return undefined;
  }

  // Schickt die DM und sagt, wie sie ausging. Scheitert sie anders als mit
  // `kein_dm`, eine Zeile ins Log; der Befehl geht trotzdem weiter.
  private async dm(f: Fall, inhalt: string): Promise<DmAusgang> {
    try {
      await this.k.w.schreibe(f.server, f.ziel.person.id, ohneHasszeichen(inhalt));
      return 'angekommen';
    } catch (fehler) {
      if (fehler instanceof DiscordFehler && fehler.code === 'kein_dm') return 'kein_dm';
      console.error(`/${f.art}: DM nicht gesendet: ${text(fehler)}`);
      return 'fehler';
    }
  }

  // Bannt oder kickt; erwartete Fehler werden ein Satz.
  private async tue(f: Fall, art: 'ban' | 'kick'): Promise<string | undefined> {
    const grund = ohneHasszeichen(`${f.grund} · /${art} von ${f.wer.benutzername}`);
    try {
      await (art === 'ban' ? this.k.w.banne(f.server, f.ziel.person.id, grund) : this.k.w.kicke(f.server, f.ziel.person.id, grund));
      return undefined;
    } catch (fehler) {
      if (fehler instanceof DiscordFehler && fehler.code === 'kein_recht') return 'kitty fehlt das Recht dazu, oder die Rolle von kitty steht zu tief.';
      if (fehler instanceof DiscordFehler && fehler.code === 'kein_mitglied') return 'Diesen Nutzer gibt es auf dem Server nicht mehr.';
      throw fehler;
    }
  }

  private async verwarne(f: Fall, s: Strafen): Promise<string> {
    const dm = await this.dm(f, `Verwarnung auf ${f.server.name}: ${f.grund}`);
    const jetzt = this.uhr();
    await this.k.db.query('INSERT INTO verwarnungen (server, ziel, moderator, grund, zeit) VALUES ($1, $2, $3, $4, $5)', [
      f.server.id,
      f.ziel.person.id,
      f.wer.id,
      f.grund,
      new Date(jetzt),
    ]);
    const { rows } = await this.k.db.query<{ zahl: number }>('SELECT count(*)::int AS zahl FROM verwarnungen WHERE server = $1 AND ziel = $2 AND zeit > $3', [
      f.server.id,
      f.ziel.person.id,
      new Date(jetzt - s.verwarnungTage * tag),
    ]);
    const n = rows[0]?.zahl ?? 1;
    return `${f.ziel.person.name} ist verwarnt, zum ${n}. Mal. Grund: ${f.grund}. ${dmSatz[dm]}`;
  }
}

// Löscht Bans und Kicks älter als 7 Tage und Verwarnungen älter als die
// Frist ihres Servers, ohne Einstellung 365 Tage. Gibt die Zahl der Zeilen.
// Siehe docs/bot/datenschutz.md, „Was der Bot speichert“.
export async function raeumeStrafenAuf(db: Pick<Pool, 'query'>, jetzt: number): Promise<number> {
  const { rows } = await db.query<{ zahl: number }>(
    `WITH aktionen AS (DELETE FROM strafaktionen WHERE zeit <= $1 RETURNING 1),
          warnungen AS (
            DELETE FROM verwarnungen v
            WHERE v.zeit <= $2::timestamptz - make_interval(days => coalesce((SELECT s.verwarnung_tage FROM strafen s WHERE s.server = v.server), 365))
            RETURNING 1)
     SELECT (SELECT count(*) FROM aktionen)::int + (SELECT count(*) FROM warnungen)::int AS zahl`,
    [new Date(jetzt - sieben), new Date(jetzt)],
  );
  return rows[0]?.zahl ?? 0;
}
