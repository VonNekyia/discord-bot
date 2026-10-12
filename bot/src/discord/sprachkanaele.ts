import { ChannelType, PermissionFlagsBits as P, type CategoryChannel, type VoiceChannel } from 'discord.js';
import { DiscordFehler, uebersetzt } from './fehler.js';
import { alsNachricht, type Menue } from './menue.js';
import { alsMitglied, type Mitglied } from './nachrichten.js';
import { vergleiche, wieDiscord } from './ordnung.js';
import { alsEintrag, alsOverwrite, type Eintrag } from './rechte.js';
import { guildVon, type Server } from './server.js';

// Sprachkanäle, Kategorien und Räume über den Griff `Server`, für das Modul
// Sprachräume. Jeder Aufruf an Discord wirft `DiscordFehler`.
// Siehe docs/bot/sprachraeume-bau.md, „Module“.

export type Sprachkanal = { id: string; name: string; kategorie: { id: string; name: string } | null; bereit: boolean };
export type Kategorie = { id: string; name: string; bereit: boolean };
export type Liste = { sprachkanaele: Sprachkanal[]; kategorien: Kategorie[]; ohneKategorie: { bereit: boolean } };

// Was der Bot auf dem ganzen Server braucht, auch was er nur weitergibt.
// Siehe docs/benutzung/sprachraeume.md, „Rechte und Intent“.
const noetig = [P.ManageChannels, P.ManageRoles, P.MoveMembers, P.ViewChannel, P.Connect, P.SendMessages, P.ReadMessageHistory];

// Sprachkanäle und Kategorien mit `bereit`, ohne Bühnen und ohne die Räume
// selbst (`raeume`). Eine Kategorie ist bereit, wenn der Bot auf dem Server
// alles hat, sie ihm nichts davon nimmt und er jedes Recht ihrer Einträge
// selbst hat; er kopiert sie in jeden Raum.
// Siehe docs/schnittstelle/sprachraeume.md, „Typen“.
export function sprachListe(server: Server, raeume: ReadonlySet<string> = new Set()): Liste {
  const guild = guildVon(server);
  const ich = guild.members.me;
  const rechte = ich?.permissions;
  const ohneKategorie = rechte?.has(noetig) ?? false;
  const sprachkanaele: VoiceChannel[] = [];
  for (const kanal of guild.channels.cache.values()) {
    if (kanal.type === ChannelType.GuildVoice && !raeume.has(kanal.id)) sprachkanaele.push(kanal);
  }
  const alleKategorien = [...guild.channels.cache.values()].filter((k): k is CategoryChannel => k.type === ChannelType.GuildCategory);
  const kategorien = alleKategorien.toSorted(vergleiche).map((kategorie) => ({
    id: kategorie.id,
    name: kategorie.name,
    bereit: Boolean(ich && rechte && kategorieBereit(kategorie, ohneKategorie)),
  }));
  return {
    sprachkanaele: wieDiscord(sprachkanaele).map((kanal) => ({
      id: kanal.id,
      name: kanal.name,
      kategorie: kanal.parent && { id: kanal.parent.id, name: kanal.parent.name },
      bereit: Boolean(ich && kanal.permissionsFor(ich).has([P.ViewChannel, P.Connect, P.MoveMembers])),
    })),
    kategorien,
    ohneKategorie: { bereit: ohneKategorie },
  };
}

function kategorieBereit(kategorie: CategoryChannel, ohneKategorie: boolean): boolean {
  const ich = kategorie.guild.members.me;
  if (!ohneKategorie || !ich || !kategorie.permissionsFor(ich).has(noetig)) return false;
  return [...kategorie.permissionOverwrites.cache.values()].every((eintrag) => ich.permissions.has(eintrag.allow.bitfield | eintrag.deny.bitfield));
}

// Wer in einem Kanal ist, aus den Voice States, nicht aus dem Cache der
// Mitglieder; der hält nur den Bot. Siehe docs/bot/sprachraeume-bau.md, „Belegung“.
export function belegung(server: Server, kanal: string): string[] {
  return [...guildVon(server).voiceStates.cache.values()].filter((s) => s.channelId === kanal).map((s) => s.id);
}

export function hatKanal(server: Server, kanal: string): boolean {
  return guildVon(server).channels.cache.has(kanal);
}

// Die ID des Bots auf dem Server; undefined, solange er sich nicht kennt.
export function bot(server: Server): string | undefined {
  return guildVon(server).members.me?.id;
}

// Die Kategorie, in der ein Kanal steht, oder null.
export function kategorieVon(server: Server, kanal: string): string | null {
  return guildVon(server).channels.cache.get(kanal)?.parentId ?? null;
}

// Die Rechte-Einträge einer Kategorie; undefined, wenn der Kanal keine Kategorie ist.
export function eintraegeVon(server: Server, kategorie: string): Eintrag[] | undefined {
  const kanal = guildVon(server).channels.cache.get(kategorie);
  if (kanal?.type !== ChannelType.GuildCategory) return undefined;
  return [...kanal.permissionOverwrites.cache.values()].map(alsEintrag);
}

// Ein Mitglied frisch von Discord; es kommt nicht in den Cache.
export async function holeMitglied(server: Server, nutzer: string): Promise<Mitglied> {
  return alsMitglied(await uebersetzt(() => guildVon(server).members.fetch({ user: nutzer, force: true })));
}

// Legt einen Sprachkanal in einem Aufruf an, mit allen Einträgen, und gibt seine ID zurück.
export async function legeSprachkanalAn(
  server: Server,
  o: { name: string; kategorie: string | null; limit: number; eintraege: Eintrag[]; grund: string },
): Promise<string> {
  const kanal = await uebersetzt(() =>
    guildVon(server).channels.create({
      name: o.name,
      type: ChannelType.GuildVoice,
      parent: o.kategorie,
      userLimit: o.limit,
      permissionOverwrites: o.eintraege.map(alsOverwrite),
      reason: o.grund,
    }),
  );
  return kanal.id;
}

// Verschiebt ein Mitglied in einen Sprachkanal; mit null trennt es.
export async function verschiebe(server: Server, nutzer: string, kanal: string | null, grund: string): Promise<void> {
  await uebersetzt(() => guildVon(server).members.edit(nutzer, { channel: kanal, reason: grund }));
}

export async function loescheKanal(server: Server, kanal: string, grund: string): Promise<void> {
  await uebersetzt(() => guildVon(server).channels.delete(kanal, grund));
}

// Postet das Menü in den Textchat eines Sprachkanals.
export async function sendeMenue(server: Server, kanal: string, m: Menue): Promise<void> {
  await uebersetzt(async () => {
    const ziel = guildVon(server).channels.cache.get(kanal);
    // Weg, bevor das Menü kam: wie Discord es mit 10003 meldet.
    if (ziel?.type !== ChannelType.GuildVoice) throw new DiscordFehler('nicht_gefunden', 'Unknown Channel');
    await ziel.send(alsNachricht(m));
  });
}

// Ein Raum für die Knöpfe des Menüs. Name, Limit und Einträge liest es bei
// jedem Zugriff aus dem Cache; was es setzt, legt discord.js gleich dort ab.
// Siehe docs/bot/sprachraeume-menue.md, „Eins nach dem anderen je Raum“.
export interface Sprachraum {
  readonly id: string;
  readonly name: string;
  readonly limit: number;
  readonly eintraege: Eintrag[];
  // Die Einträge seiner Kategorie; leer ohne Kategorie.
  readonly kategorieEintraege: Eintrag[];
  // Alle Einträge in einem PATCH; ohne `name` gilt das Sublimit nicht.
  setzeRechte(eintraege: Eintrag[], grund: string): Promise<void>;
  // Wartet nicht auf ein Rate-Limit, sondern wirft `zu_schnell` mit `warten`.
  // Siehe docs/bot/rate-limits.md, „Kanäle ändern“.
  benenne(name: string, grund: string): Promise<void>;
  setzeLimit(limit: number, grund: string): Promise<void>;
}

// Der Sprachkanal mit dieser ID als `Sprachraum`; undefined für jeden anderen Kanal.
export function sprachraum(server: Server, id: string): Sprachraum | undefined {
  const kanal = guildVon(server).channels.cache.get(id);
  if (kanal?.type !== ChannelType.GuildVoice) return undefined;
  return {
    id: kanal.id,
    get name() {
      return kanal.name;
    },
    get limit() {
      return kanal.userLimit;
    },
    get eintraege() {
      return [...kanal.permissionOverwrites.cache.values()].map(alsEintrag);
    },
    get kategorieEintraege() {
      return [...(kanal.parent?.permissionOverwrites.cache.values() ?? [])].map(alsEintrag);
    },
    async setzeRechte(eintraege, grund) {
      await uebersetzt(() => kanal.permissionOverwrites.set(eintraege.map(alsOverwrite), grund));
    },
    async benenne(name, grund) {
      await uebersetzt(() => kanal.setName(name, grund));
    },
    async setzeLimit(limit, grund) {
      await uebersetzt(() => kanal.setUserLimit(limit, grund));
    },
  };
}
