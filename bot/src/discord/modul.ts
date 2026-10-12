import { Events, type Client } from 'discord.js';
import type { Modul } from '../kern/modul.js';
import { beantworte, type Befehl } from './befehle.js';
import { alsDruck, type Druck } from './interaktionen.js';
import type { Kontext } from './kontext.js';
import { alsMitglied, type Mitglied } from './nachrichten.js';
import { serverVon, type Server } from './server.js';

// Ereignisse von Discord mit eigenen Typen. Jedes Modul fängt seine Fehler
// selbst und loggt sie. Siehe docs/entwicklung/struktur.md, „Ein Modul“.
export interface Ereignisse {
  // Nach dem Verbinden, mit den Servern dieses Prozesses, also seiner Shards.
  // Ruft bot/src/index.ts nach dem Abgleich der Server, Modul für Modul.
  bereit(server: Server[]): Promise<void>;
  beitritt(mitglied: Mitglied): Promise<void>;
  abschied(mitglied: Mitglied): Promise<void>;
  // Ein Mitglied wechselt den Sprachkanal; `null` heisst keiner.
  stimme(server: Server, nutzer: string, vorher: string | null, nachher: string | null): Promise<void>;
  // Ein Kanal eines Servers ist gelöscht, auch von Hand.
  kanalWeg(kanal: string): Promise<void>;
}

// Ein Modul mit dem, was nur die Discord-Schicht kennt: Befehle, Knöpfe und
// Ereignisse. Der Vertrag in kern/modul.ts kennt keine Typen von Discord.
export interface DiscordModul extends Modul<Kontext> {
  befehle?: readonly Befehl[];
  // Knöpfe, Nutzerauswahl und Formulare mit `praefix` am Anfang von `custom_id`.
  knoepfe?: { praefix: string; bediene(druck: Druck): Promise<void> };
  ereignisse?: Partial<Ereignisse>;
}

// Die Slash-Befehle aller Module.
export function befehleVon(module: readonly DiscordModul[]): Befehl[] {
  return module.flatMap((m) => m.befehle ?? []);
}

// Hängt die Ereignisse aller Module an den Client, je Ereignis einmal; die
// Module bekommen es in der Reihenfolge der Liste. `bereit` ruft
// bot/src/index.ts selbst, weil es nach dem Abgleich der Server kommt.
export function haengeAn(client: Client, module: readonly DiscordModul[]): void {
  const befehle = befehleVon(module);
  client.on(Events.GuildMemberAdd, (mitglied) => {
    const m = alsMitglied(mitglied);
    for (const { ereignisse } of module) void ereignisse?.beitritt?.(m);
  });
  client.on(Events.GuildMemberRemove, (mitglied) => {
    const m = alsMitglied(mitglied);
    for (const { ereignisse } of module) void ereignisse?.abschied?.(m);
  });
  client.on(Events.VoiceStateUpdate, (vorher, nachher) => {
    const server = serverVon(nachher.guild);
    for (const { ereignisse } of module) void ereignisse?.stimme?.(server, nachher.id, vorher.channelId, nachher.channelId);
  });
  client.on(Events.ChannelDelete, (kanal) => {
    if (kanal.isDMBased()) return;
    for (const { ereignisse } of module) void ereignisse?.kanalWeg?.(kanal.id);
  });
  client.on(Events.InteractionCreate, (interaction) => {
    if (interaction.isChatInputCommand()) {
      void beantworte(interaction, befehle);
      return;
    }
    // Erkannt am Präfix in `custom_id`. Siehe docs/bot/sprachraeume-menue.md, „Knöpfe“.
    for (const { knoepfe } of module) {
      const druck = knoepfe && alsDruck(interaction, knoepfe.praefix);
      if (druck) {
        void knoepfe.bediene(druck);
        return;
      }
    }
  });
}
