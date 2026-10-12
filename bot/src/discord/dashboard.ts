import type { Client, Guild } from 'discord.js';
import type { Debug, Zaehlung } from '../kern/zaehlung.js';
import { Berechtigte } from './eigentuemer.js';
import { verwaltet, type Kontext, type NichtVerwalten } from './kontext.js';
import { oauthUeber, type OAuthFrage } from './oauth.js';
import { debugStand } from './zaehlen.js';

// Ein Server in der Liste des Dashboards.
export interface ServerEintrag {
  id: string;
  name: string;
  icon: string | null;
}

// Was die API des Dashboards von Discord braucht, mit eigenen Typen; die API
// sieht keinen Client. Siehe docs/bot/dashboard-api.md, „Dateien“.
export interface DashboardGriff {
  // Die Aufrufe der Anmeldung. Siehe docs/bot/rate-limits.md, „Anmeldung“.
  frage: OAuthFrage;
  // Darf `nutzer` die Debug-Seite sehen? Wirft, wenn Discord die Anwendung
  // nicht liefert. Siehe docs/schnittstelle/debug.md, „Wer sie sehen darf“.
  darfDebug(nutzer: string): Promise<boolean>;
  // Der Stand für die Debug-Seite.
  debug(): Debug;
  // Die Adresse des Avatars mit 128 px.
  avatar(nutzer: string, hash: string): string;
  // Die Server aus `ids`, auf denen der Bot ist und die Discord gerade liefert, in der Reihenfolge von `ids`.
  server(ids: readonly string[]): ServerEintrag[];
  // Siehe `verwaltet` in `discord/kontext.ts`.
  verwaltet(id: string, nutzer: string): Promise<Kontext | NichtVerwalten>;
}

// Der Griff aus dem Client des Bots. `zaehlung` zählt die Anfragen der
// Anmeldung und liefert den Stand für Debug; `uhr` gilt für die Liste der
// Berechtigten.
export function dashboardGriff(client: Client, o: { zaehlung: Pick<Zaehlung, 'antwort' | 'stand'>; uhr?: () => number }): DashboardGriff {
  const berechtigte = new Berechtigte(client, o.uhr);
  return {
    // Über eine eigene REST-Instanz mit der Basis des Clients.
    frage: oauthUeber(client.rest, { zaehlung: o.zaehlung }),
    darfDebug: (nutzer) => berechtigte.darf(nutzer),
    debug: () => debugStand(client, o.zaehlung),
    avatar: (nutzer, hash) => client.rest.cdn.avatar(nutzer, hash, { size: 128 }),
    server: (ids) =>
      ids
        .map((id) => client.guilds.cache.get(id))
        .filter((guild): guild is Guild => guild?.available === true)
        .map((guild) => ({ id: guild.id, name: guild.name, icon: guild.iconURL({ size: 128 }) })),
    verwaltet: (id, nutzer) => verwaltet(client, id, nutzer),
  };
}
