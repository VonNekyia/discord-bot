import { Events, MessageFlags, type Client } from 'discord.js';
import { text } from '../kern/fehler.js';
import type { Modul } from '../kern/modul.js';
import { beantworte, fehlgeschlagen, schlageVor, type Befehl } from './befehle.js';
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
  // Nur auf Servern, auf denen das Modul an ist.
  ereignisse?: Partial<Ereignisse>;
  // Auch auf Servern, auf denen es aus ist: was aufgeräumt werden muss,
  // etwa leere Sprachräume. Siehe docs/schnittstelle/module.md, „Ein Modul ist aus“.
  aufraeumen?: Partial<Ereignisse>;
}

// Ob ein Modul auf einem Server an ist; im Bot `Brett#istAn`.
export type IstAn = (modul: string, server: string) => Promise<boolean>;

// Die Antwort auf Befehle und Knöpfe eines Moduls, das aus ist.
export const modulAus = 'Dieses Modul ist auf dem Server aus. Das Team schaltet es im Dashboard unter „Module“ an.';

// Ob `m` auf `server` an ist. Ein Modul ohne Schalter ist immer an; scheitert
// die Frage, `fehler`, und eine Zeile geht ins Log. Ein Ereignis behandelt
// `fehler` wie aus, ein Befehl oder Knopf antwortet `fehlgeschlagen`: Auf dem
// Board steht das Modul ja an. Siehe docs/entwicklung/struktur.md, „Ein Modul“.
async function zustand(m: DiscordModul, server: string, istAn: IstAn): Promise<'an' | 'aus' | 'fehler'> {
  if (!m.schalter) return 'an';
  return istAn(m.name, server).then(
    (ja) => (ja ? 'an' : 'aus'),
    (fehler: unknown) => {
      console.error(`Board: ${text(fehler)}`);
      return 'fehler';
    },
  );
}

// Wie lange eine Interaktion höchstens auf `zustand` wartet, in ms. Discord
// wartet höchstens 3 s auf die erste Antwort, und ein Formular muss die erste
// sein; ein `warte` davor geht also nicht. Die Frage kann bei einem bezahlten
// Modul Discord fragen. Siehe docs/benutzung/befehle.md, „Fehler“.
export const fristInteraktion = 2_000;

// `zustand` mit Frist: Läuft sie ab, `fehler` und eine Zeile ins Log; eine
// späte Antwort zählt nicht mehr.
function zustandBis(m: DiscordModul, server: string, istAn: IstAn, frist: number): Promise<'an' | 'aus' | 'fehler'> {
  if (!m.schalter) return Promise.resolve('an');
  let uhr: ReturnType<typeof setTimeout> | undefined;
  const abgelaufen = new Promise<'fehler'>((fertig) => {
    uhr = setTimeout(() => {
      console.error(`Board: keine Antwort nach ${frist} ms`);
      fertig('fehler');
    }, frist);
  });
  return Promise.race([zustand(m, server, istAn), abgelaufen]).finally(() => clearTimeout(uhr));
}

async function an(m: DiscordModul, server: string, istAn: IstAn): Promise<boolean> {
  return (await zustand(m, server, istAn)) === 'an';
}

// Die Antwort eines Befehls oder Knopfs, wenn das Modul nicht an ist.
const statt = { aus: modulAus, fehler: fehlgeschlagen } as const;

// Gibt ein Ereignis eines Servers an jedes Modul: `aufraeumen` immer,
// `ereignisse` nur, wenn das Modul dort an ist. Jedes Modul für sich, in
// der Reihenfolge der Liste angestossen.
function verteile(module: readonly DiscordModul[], server: string, istAn: IstAn, tue: (e: Partial<Ereignisse>) => void): void {
  for (const m of module) {
    if (m.aufraeumen) tue(m.aufraeumen);
    const { ereignisse } = m;
    if (!ereignisse) continue;
    if (!m.schalter) {
      tue(ereignisse);
      continue;
    }
    void an(m, server, istAn).then((ja) => ja && tue(ereignisse));
  }
}

// Nach dem Verbinden, Modul für Modul: `aufraeumen.bereit` mit allen
// Servern, `ereignisse.bereit` nur mit denen, auf denen das Modul an ist.
export async function meldeBereit(module: readonly DiscordModul[], server: readonly Server[], istAn: IstAn = async () => true): Promise<void> {
  /* oxlint-disable no-await-in-loop */
  for (const m of module) {
    await m.aufraeumen?.bereit?.([...server]);
    const bereit = m.ereignisse?.bereit;
    if (!bereit) continue;
    const ja = await Promise.all(server.map((s) => an(m, s.id, istAn)));
    await bereit(server.filter((_, i) => ja[i]));
  }
  /* oxlint-enable no-await-in-loop */
}

// Die Slash-Befehle aller Module.
export function befehleVon(module: readonly DiscordModul[]): Befehl[] {
  return module.flatMap((m) => m.befehle ?? []);
}

// Hängt die Ereignisse aller Module an den Client, je Ereignis einmal; die
// Module bekommen es in der Reihenfolge der Liste, nur wenn sie auf dem
// Server an sind, siehe `verteile`. Befehle und Knöpfe eines Moduls, das
// aus ist, antworten `modulAus`. `bereit` ruft bot/src/index.ts selbst über
// `meldeBereit`, weil es nach dem Abgleich der Server kommt. Bei Befehlen,
// Knöpfen und Autocomplete wartet die Frage, ob das Modul an ist, höchstens
// `frist` ms. Siehe docs/schnittstelle/module.md, „Ein Modul ist aus“.
export function haengeAn(client: Client, module: readonly DiscordModul[], istAn: IstAn = async () => true, frist = fristInteraktion): void {
  const befehle = befehleVon(module);
  client.on(Events.GuildMemberAdd, (mitglied) => {
    const m = alsMitglied(mitglied);
    verteile(module, mitglied.guild.id, istAn, (e) => void e.beitritt?.(m));
  });
  client.on(Events.GuildMemberRemove, (mitglied) => {
    const m = alsMitglied(mitglied);
    verteile(module, mitglied.guild.id, istAn, (e) => void e.abschied?.(m));
  });
  client.on(Events.VoiceStateUpdate, (vorher, nachher) => {
    const server = serverVon(nachher.guild);
    verteile(module, server.id, istAn, (e) => void e.stimme?.(server, nachher.id, vorher.channelId, nachher.channelId));
  });
  client.on(Events.ChannelDelete, (kanal) => {
    if (kanal.isDMBased()) return;
    verteile(module, kanal.guildId, istAn, (e) => void e.kanalWeg?.(kanal.id));
  });
  client.on(Events.InteractionCreate, (interaction) => {
    // Vorschläge nur, wenn das Modul an ist; sonst eine leere Liste.
    if (interaction.isAutocomplete()) {
      const besitzer = module.find((m) => m.befehle?.some((b) => b.name === interaction.commandName));
      const server = interaction.guildId;
      void (besitzer && server ? zustandBis(besitzer, server, istAn, frist) : Promise.resolve('an' as const)).then((z) => schlageVor(interaction, befehle, z === 'an'))
        .catch((e: unknown) => console.error(`/${interaction.commandName}: Vorschläge fehlgeschlagen: ${text(e)}`));
      return;
    }
    if (interaction.isChatInputCommand()) {
      const besitzer = module.find((m) => m.befehle?.some((b) => b.name === interaction.commandName));
      const server = interaction.guildId;
      if (!besitzer?.schalter || !server) {
        void beantworte(interaction, befehle);
        return;
      }
      void zustandBis(besitzer, server, istAn, frist).then((z) =>
        z === 'an'
          ? beantworte(interaction, befehle)
          : interaction
              .reply({ content: statt[z], flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } })
              .then(
                () => undefined,
                (e: unknown) => console.error(`/${interaction.commandName}: Antwort fehlgeschlagen: ${text(e)}`),
              ),
      );
      return;
    }
    // Erkannt am Präfix in `custom_id`. Siehe docs/bot/sprachraeume-menue.md, „Knöpfe“.
    for (const m of module) {
      const { knoepfe } = m;
      const druck = knoepfe && alsDruck(interaction, knoepfe.praefix);
      if (druck) {
        void zustandBis(m, druck.server.id, istAn, frist).then((z) =>
          z === 'an' ? knoepfe.bediene(druck) : druck.antworte(statt[z]).catch((e: unknown) => console.error(`Knopf: Antwort fehlgeschlagen: ${text(e)}`)),
        );
        return;
      }
    }
  });
}
