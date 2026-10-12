// Zählt die Anfragen des Bots an Discord, jedes 429, die ungültigen Anfragen
// der letzten 10 min und die eigenen Grenzen; nur im Speicher, seit dem
// Start. Kennt weder Discord noch Module: Die Discord-Schicht gibt jede
// Antwort hierher. Siehe docs/bot/rate-limits.md, „Zählen“.

// Ab hier sperrt Cloudflare die IP für eine Weile, ab hier warnt das Log.
// Siehe docs/bot/rate-limits.md, „Ungültige Anfragen“.
export const grenzeUngueltig = 10_000;
export const warnungUngueltig = 1_000;
const zehnMinuten = 10 * 60_000;

export type EigeneGrenze = 'bremse' | 'sitzung' | 'bilder' | 'testnachricht';
const eigeneGrenzen: readonly EigeneGrenze[] = ['bremse', 'sitzung', 'bilder', 'testnachricht'];

type Scope = 'user' | 'global' | 'shared';

// Eine Antwort von Discord: Methode, Pfad mit IDs, Status und Header.
export interface Antwort {
  methode: string;
  pfad: string;
  status: number;
  kopf(name: string): string | null;
}

export interface DebugRoute {
  methode: string;
  route: string;
  anfragen: number;
  rateLimits: number;
  limit: number | null;
  remaining: number | null;
  resetAfter: number | null;
  zuletzt: string;
}

// Der Stand in der Form, die die Debug-Seite ausliefert.
export interface Debug {
  seit: string;
  jetzt: string;
  shards: number[];
  routen: DebugRoute[];
  rateLimits: { anzahl: number; global: number; scope: Record<Scope, number> };
  ungueltig: { letzte10min: number; warnung: number; grenze: number };
  eigene: { name: EigeneGrenze; gegriffen: number }[];
}

// Die Route eines Pfads ohne IDs und Tokens: Zahlen werden `:id`, das
// Segment nach `/webhooks/:id` und `/interactions/:id` wird `:token`, und
// alles, was kein kurzes Wort ist, auch. Der Rest von `@discordjs/rest`
// zählt nicht: `majorParameter` trägt bei Webhooks den Token.
// Siehe docs/bot/rate-limits.md, „Zählen“.
export function route(pfad: string): string {
  const teile = (pfad.split('?')[0] ?? '').split('/');
  return teile
    .map((roh, i) => {
      const teil = entschluessle(roh);
      if (teil === '') return teil;
      if (/^\d+$/.test(teil)) return ':id';
      const davor = teile[i - 2];
      if ((davor === 'webhooks' || davor === 'interactions') && /^\d+$/.test(teile[i - 1] ?? '')) return ':token';
      return /^@?[a-z][a-z0-9_-]{0,31}$/.test(teil) ? teil : ':token';
    })
    .join('/');
}

// Ein Segment wie `%40original` als `@original`; ist es kaputt, bleibt es, wie es ist.
function entschluessle(teil: string): string {
  try {
    return decodeURIComponent(teil);
  } catch {
    return teil;
  }
}

// Eine Zahl aus einem Header, sonst null.
function zahl(wert: string | null): number | null {
  if (wert === null || wert.trim() === '') return null;
  const n = Number(wert);
  return Number.isFinite(n) ? n : null;
}

const zeige = (wert: number | null) => (wert === null ? '-' : String(wert));

export class Zaehlung {
  private readonly seit: number;
  private readonly routen = new Map<string, DebugRoute>();
  private readonly scope: Record<Scope, number> = { user: 0, global: 0, shared: 0 };
  private rateLimits = 0;
  private globale = 0;
  // Zeiten der ungültigen Anfragen, aufsteigend, höchstens 10 min alt.
  private ungueltig: number[] = [];
  private gewarnt = false;
  private readonly eigene = new Map<EigeneGrenze, number>(eigeneGrenzen.map((name) => [name, 0]));
  private readonly uhr: () => number;
  private readonly log: (zeile: string) => void;

  constructor(o: { uhr?: () => number; log?: (zeile: string) => void } = {}) {
    this.uhr = o.uhr ?? (() => Date.now());
    this.log = o.log ?? ((zeile) => console.error(zeile));
    this.seit = this.uhr();
  }

  // Jede Antwort von Discord, auch 429 und 5xx. Ins Log kommen nur Methode,
  // Route, Scope, `global` und Zahlen. Siehe docs/bot/datenschutz.md, „Was ins Log geht“.
  antwort(a: Antwort): void {
    const jetzt = this.uhr();
    const methode = a.methode.toUpperCase();
    const weg = route(a.pfad);
    const schluessel = `${methode} ${weg}`;
    const r = this.routen.get(schluessel) ?? {
      methode,
      route: weg,
      anfragen: 0,
      rateLimits: 0,
      limit: null,
      remaining: null,
      resetAfter: null,
      zuletzt: '',
    };
    r.anfragen++;
    r.limit = zahl(a.kopf('x-ratelimit-limit'));
    r.remaining = zahl(a.kopf('x-ratelimit-remaining'));
    r.resetAfter = zahl(a.kopf('x-ratelimit-reset-after'));
    r.zuletzt = new Date(jetzt).toISOString();
    this.routen.set(schluessel, r);

    let scope: Scope | undefined;
    if (a.status === 429) {
      // Ohne Header zählt ein 429 als `user`, wie bei `@discordjs/rest`.
      const kopf = a.kopf('x-ratelimit-scope');
      scope = kopf === 'global' || kopf === 'shared' ? kopf : 'user';
      const global = (a.kopf('x-ratelimit-global') ?? 'false') !== 'false';
      r.rateLimits++;
      this.rateLimits++;
      this.scope[scope]++;
      if (global) this.globale++;
      this.log(
        `Rate-Limit: 429 bei ${methode} ${weg}, Scope ${scope}, global ${global ? 'ja' : 'nein'}, ` +
          `Retry-After ${zeige(zahl(a.kopf('retry-after')))} s, Limit ${zeige(r.limit)}, Remaining ${zeige(r.remaining)}, ` +
          `Reset-After ${zeige(r.resetAfter)} s.`,
      );
    }
    // Ungültig sind 401, 403 und 429; ein 429 mit Scope `shared` zählt bei Discord nicht.
    if ((a.status === 401 || a.status === 403 || a.status === 429) && scope !== 'shared') this.zaehleUngueltig(jetzt);
  }

  // Eine eigene Grenze hat gegriffen.
  griff(name: EigeneGrenze): void {
    this.eigene.set(name, (this.eigene.get(name) ?? 0) + 1);
  }

  // Warnt einmal, wenn das Fenster 1000 erreicht; erst wenn es darunter
  // fällt, wieder. Siehe docs/bot/rate-limits.md, „Ungültige Anfragen“.
  private zaehleUngueltig(jetzt: number): void {
    this.ungueltig.push(jetzt);
    const zahlJetzt = this.fenster(jetzt);
    if (zahlJetzt < warnungUngueltig || this.gewarnt) return;
    this.gewarnt = true;
    this.log(`Rate-Limit: ${zahlJetzt} ungültige Anfragen in 10 min; Warnung ab ${warnungUngueltig}, Cloudflare sperrt ab ${grenzeUngueltig}.`);
  }

  // Wirft alles aus dem Fenster, was älter als 10 min ist, und gibt die Zahl zurück.
  private fenster(jetzt: number): number {
    const ab = this.ungueltig.findIndex((zeit) => zeit > jetzt - zehnMinuten);
    this.ungueltig = ab < 0 ? [] : this.ungueltig.slice(ab);
    if (this.ungueltig.length < warnungUngueltig) this.gewarnt = false;
    return this.ungueltig.length;
  }

  // Der Stand für die Debug-Seite: `routen` nach Anfragen absteigend, dann
  // nach Route und Methode; `eigene` immer alle vier.
  stand(shards: number[]): Debug {
    const jetzt = this.uhr();
    // Kopien: Ein Stand ändert sich nicht mehr, wenn weitere Antworten kommen.
    const routen = [...this.routen.values()]
      .map((r) => structuredClone(r))
      .toSorted((a, b) => b.anfragen - a.anfragen || (a.route < b.route ? -1 : a.route > b.route ? 1 : 0) || (a.methode < b.methode ? -1 : 1));
    return {
      seit: new Date(this.seit).toISOString(),
      jetzt: new Date(jetzt).toISOString(),
      shards: [...shards],
      routen,
      rateLimits: { anzahl: this.rateLimits, global: this.globale, scope: { ...this.scope } },
      ungueltig: { letzte10min: this.fenster(jetzt), warnung: warnungUngueltig, grenze: grenzeUngueltig },
      eigene: eigeneGrenzen.map((name) => ({ name, gegriffen: this.eigene.get(name) ?? 0 })),
    };
  }
}
