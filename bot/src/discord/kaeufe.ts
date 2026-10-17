import { Events, Routes, type Client, type Entitlement } from 'discord.js';
import { istObjekt } from '../kern/eingabe.js';
import { DiscordFehler, uebersetzt } from './fehler.js';

// Ein Kauf bei Discord, ein Einmalkauf oder ein Abo eines Servers, mit
// eigenen Typen. Die Discord-ID der Person, die gekauft hat, liest der Bot
// nicht. Siehe docs/bot/datenschutz.md, „Was der Bot speichert“.
export interface Kauf {
  id: string;
  sku: string;
  // Der Server eines Abos; bei einem Einmalkauf null.
  server: string | null;
  verbraucht: boolean;
  geloescht: boolean;
  // Wann er endet, in ms seit 1970; null heisst nie.
  ende: number | null;
}

// Käufe bei Discord lesen und verbrauchen, über die REST-API, nicht über
// `client.application.entitlements`: Dessen Cache hielte die Discord-ID der
// Person. Jeder Aufruf wirft `DiscordFehler`.
// Siehe docs/entscheidungen/0020-bezahlte-module.md, „Entscheidung“.
export interface Kaeufe {
  // Die Käufe einer Person für eine SKU, auch verbrauchte, ohne gelöschte.
  vonPerson(nutzer: string, sku: string): Promise<Kauf[]>;
  // Die Abos eines Servers für diese SKUs, ohne beendete.
  vonServer(server: string, skus: readonly string[]): Promise<Kauf[]>;
  // Alle Käufe einer SKU, auch gelöschte, Seite für Seite; scheitert eine
  // Seite, wirft die nächste Runde. Siehe docs/schnittstelle/module.md, „Kauf binden“.
  seitenDerSku(sku: string): AsyncIterable<Kauf[]>;
  // Ein Kauf über seine ID; undefined, wenn Discord ihn nicht kennt.
  einer(id: string): Promise<Kauf | undefined>;
  verbrauche(id: string): Promise<void>;
  // Der Link in den Store: zur SKU, ohne sie in den Store der Anwendung.
  laden(sku?: string): string;
}

export type KaufEreignis = 'neu' | 'geaendert' | 'geloescht';

// Ein Entitlement aus einer Antwort von Discord; was nicht passt, wirft.
function ausApi(e: unknown): Kauf {
  if (!istObjekt(e) || typeof e.id !== 'string' || typeof e.sku_id !== 'string' || typeof e.deleted !== 'boolean') {
    throw new DiscordFehler('anderes', 'Discord liefert ein unerwartetes Entitlement.');
  }
  const server = typeof e.guild_id === 'string' ? e.guild_id : null;
  const ende = typeof e.ends_at === 'string' ? Date.parse(e.ends_at) : null;
  return { id: e.id, sku: e.sku_id, server, verbraucht: e.consumed === true, geloescht: e.deleted, ende };
}

function ausEreignis(e: Entitlement): Kauf {
  return { id: e.id, sku: e.skuId, server: e.guildId, verbraucht: e.consumed, geloescht: e.deleted, ende: e.endsTimestamp };
}

// So viele Käufe liefert Discord je Seite höchstens.
const SEITE = 100;

// Die Käufe über den Client; die ID der Anwendung liest er erst beim Aufruf,
// nach dem Verbinden.
export function kaeufeVon(client: Client): Kaeufe {
  const anwendung = () => {
    const id = client.application?.id;
    if (!id) throw new DiscordFehler('anderes', 'Die Anwendung ist noch nicht bekannt.');
    return id;
  };
  // Die Liste Seite für Seite, mit `after` hinter dem grössten Kauf der
  // Seite, bis eine kürzer ist.
  async function* seiten(filter: Record<string, string>): AsyncGenerator<Kauf[]> {
    let nach = 0n;
    /* oxlint-disable no-await-in-loop */
    for (;;) {
      const query = new URLSearchParams({ ...filter, limit: String(SEITE), after: String(nach) });
      const antwort = await uebersetzt(() => client.rest.get(Routes.entitlements(anwendung()), { query }));
      if (!Array.isArray(antwort)) throw new DiscordFehler('anderes', 'Discord liefert keine Liste der Entitlements.');
      const seite = antwort.map(ausApi);
      yield seite;
      const groesste = seite.reduce((m, k) => (BigInt(k.id) > m ? BigInt(k.id) : m), nach);
      if (seite.length < SEITE || groesste === nach) return;
      nach = groesste;
    }
    /* oxlint-enable no-await-in-loop */
  }
  const alle = async (filter: Record<string, string>): Promise<Kauf[]> => {
    const kaeufe: Kauf[] = [];
    for await (const seite of seiten(filter)) kaeufe.push(...seite);
    return kaeufe;
  };
  return {
    vonPerson: (nutzer, sku) => alle({ user_id: nutzer, sku_ids: sku }),
    vonServer: (server, skus) => alle({ guild_id: server, sku_ids: skus.join(','), exclude_ended: 'true' }),
    seitenDerSku: (sku) => seiten({ sku_ids: sku, exclude_deleted: 'false' }),
    async einer(id) {
      try {
        return ausApi(await uebersetzt(() => client.rest.get(Routes.entitlement(anwendung(), id))));
      } catch (fehler) {
        if (fehler instanceof DiscordFehler && fehler.code === 'nicht_gefunden') return undefined;
        throw fehler;
      }
    },
    async verbrauche(id) {
      await uebersetzt(() => client.rest.post(Routes.consumeEntitlement(anwendung(), id)));
    },
    laden: (sku) => `https://discord.com/application-directory/${anwendung()}/store${sku ? `/${sku}` : ''}`,
  };
}

// Hört auf ENTITLEMENT_CREATE, ENTITLEMENT_UPDATE und ENTITLEMENT_DELETE;
// sie kommen ohne Intent. Siehe docs/bot/intents.md, „Ohne Intent“.
export function hoereAufKaeufe(client: Client, auf: (art: KaufEreignis, kauf: Kauf) => void): void {
  client.on(Events.EntitlementCreate, (e) => auf('neu', ausEreignis(e)));
  client.on(Events.EntitlementUpdate, (_alt, e) => auf('geaendert', ausEreignis(e)));
  client.on(Events.EntitlementDelete, (e) => auf('geloescht', ausEreignis(e)));
}

// Nach jeder neuen Sitzung eines Shards: beim Start und nach einem neuen
// Identify ohne Resume. Dann können Ereignisse fehlen; nach einem Resume
// spielt Discord sie nach. Siehe docs/schnittstelle/module.md, „Kauf binden“.
export function hoereAufSitzungen(client: Client, auf: (shard: { id: number; anzahl: number }) => void): void {
  client.on(Events.ShardReady, (id) => auf({ id, anzahl: client.shard?.count ?? client.options.shardCount ?? 1 }));
}
