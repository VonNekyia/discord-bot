import type { Guild } from 'discord.js';

// Nur `serverVon` setzt sie. So passt keine Guild und kein anderes Objekt
// mit ID und Name, wo ein Griff verlangt ist.
const marke = Symbol('Server');

// Ein Server, wie ein Modul ihn sieht: ID und Name. Die Guild von discord.js
// hängt nur in einer WeakMap dahinter; `guildVon` liest sie, und nur die
// Discord-Schicht ruft es auf. Siehe docs/entwicklung/struktur.md, „Die Discord-Schicht“.
export interface Server {
  readonly id: string;
  readonly name: string;
  readonly [marke]: true;
}

const guilds = new WeakMap<Server, Guild>();

export function serverVon(guild: Guild): Server {
  const server: Server = Object.freeze({ id: guild.id, name: guild.name, [marke]: true as const });
  guilds.set(server, guild);
  return server;
}

// Nur für die Discord-Schicht.
export function guildVon(server: Server): Guild {
  const guild = guilds.get(server);
  if (!guild) throw new Error('Server ohne Guild');
  return guild;
}
