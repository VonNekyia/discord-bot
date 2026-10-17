import {
  InteractionContextType,
  MessageFlags,
  Routes,
  SlashCommandBuilder,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  type REST,
} from 'discord.js';
import { text } from '../kern/fehler.js';
import { uebersetzt } from './fehler.js';
import { alsModal, type Formular } from './menue.js';
import { personVon, rangVon, type Person, type Rang } from './mitglieder.js';
import { serverVon, type Server } from './server.js';

// Ein Vorschlag für Autocomplete: Name, wie Discord ihn zeigt, und Wert.
export type Vorschlag = { name: string; wert: string };

// Eine Option eines Befehls; jede ist Pflicht.
export type Option =
  | { art: 'nutzer'; name: string; beschreibung: string }
  | {
      art: 'text';
      name: string;
      beschreibung: string;
      // `max_length` bei Discord.
      hoechstens: number;
      // Mit Autocomplete: die Vorschläge zum getippten Text, höchstens 25.
      vorschlaege?(eingabe: string, server: Server): Promise<Vorschlag[]>;
    };

// Wen eine Nutzer-Option nennt; `rang` nur, wenn er Mitglied des Servers ist.
export type Ziel = { person: Person; rang?: Rang };

// Ein Aufruf eines Slash-Befehls mit eigenen Typen. Jede Antwort ist
// ephemeral und erwähnt niemanden. Jeder Aufruf an Discord wirft `DiscordFehler`.
// Siehe docs/benutzung/befehle.md, „Antwortzeit“.
export interface Aufruf {
  // Antwortet gleich; Discord wartet höchstens 3 s auf die erste Antwort.
  antworte(inhalt: string): Promise<void>;
  // Auf einem Server: der Server, wer den Befehl nutzt und sein Rang.
  ort?: { server: Server; wer: Person; rang: Rang };
  text(name: string): string | undefined;
  ziel(name: string): Ziel | undefined;
  // Ein Formular muss die erste Antwort sein.
  zeigeFormular(f: Formular): Promise<void>;
  // Schiebt die Antwort auf (`deferReply`).
  warte(): Promise<void>;
  // Setzt die aufgeschobene Antwort.
  fertig(inhalt: string): Promise<void>;
}

// Ein Slash-Befehl: wie Discord ihn zeigt und was er tut. Der Name ist
// klein, ohne `/`. Siehe docs/benutzung/befehle.md.
export interface Befehl {
  name: string;
  beschreibung: string;
  // Nur auf Servern, nicht in DMs (`contexts` nur `GUILD`).
  nurServer?: boolean;
  optionen?: readonly Option[];
  ausfuehren(aufruf: Aufruf): Promise<void>;
}

const ohneErwaehnung = { parse: [] };

// Der Satz, wenn etwas schiefgeht. Siehe docs/benutzung/befehle.md, „Fehler“.
export const fehlgeschlagen = 'Das hat nicht geklappt.';

function alsJson(b: Befehl) {
  const bau = new SlashCommandBuilder().setName(b.name).setDescription(b.beschreibung);
  if (b.nurServer) bau.setContexts(InteractionContextType.Guild);
  for (const o of b.optionen ?? []) {
    if (o.art === 'nutzer') bau.addUserOption((x) => x.setName(o.name).setDescription(o.beschreibung).setRequired(true));
    else bau.addStringOption((x) => x.setName(o.name).setDescription(o.beschreibung).setRequired(true).setMaxLength(o.hoechstens).setAutocomplete(o.vorschlaege !== undefined));
  }
  return bau.toJSON();
}

// Ersetzt alle globalen Befehle der Anwendung mit einem Aufruf.
// Siehe docs/bot/rate-limits.md, „Befehle registrieren“.
export async function registriere(rest: REST, anwendung: string, befehle: readonly Befehl[]): Promise<void> {
  const body = befehle.map(alsJson);
  await rest.put(Routes.applicationCommands(anwendung), { body });
}

function aufrufVon(i: ChatInputCommandInteraction): Aufruf {
  const ort = i.inCachedGuild() ? { server: serverVon(i.guild), wer: personVon(i.user, i.member), rang: rangVon(i.member) } : undefined;
  return {
    async antworte(inhalt) {
      await uebersetzt(() => i.reply({ content: inhalt, flags: MessageFlags.Ephemeral, allowedMentions: ohneErwaehnung }));
    },
    ...(ort ? { ort } : {}),
    text: (name) => i.options.getString(name) ?? undefined,
    ziel(name) {
      const user = i.options.getUser(name);
      if (!user) return undefined;
      const mitglied = i.inCachedGuild() ? i.options.getMember(name) : null;
      return mitglied ? { person: personVon(user, mitglied), rang: rangVon(mitglied) } : { person: personVon(user) };
    },
    async zeigeFormular(f) {
      await uebersetzt(() => i.showModal(alsModal(f)));
    },
    async warte() {
      await uebersetzt(() => i.deferReply({ flags: MessageFlags.Ephemeral }));
    },
    async fertig(inhalt) {
      await uebersetzt(() => i.editReply({ content: inhalt, allowedMentions: ohneErwaehnung }));
    },
  };
}

// Führt den Befehl aus `befehle` aus, den `i` aufruft. Schlägt er fehl,
// sieht der Nutzer eine kurze Meldung, und ins Log geht nur der Befehl und
// der Fehlertext. Siehe docs/bot/datenschutz.md, „Was ins Log geht“.
export async function beantworte(i: ChatInputCommandInteraction, befehle: readonly Befehl[]): Promise<void> {
  const befehl = befehle.find((b) => b.name === i.commandName);
  try {
    if (!befehl) throw new Error('unbekannter Befehl');
    await befehl.ausfuehren(aufrufVon(i));
  } catch (fehler) {
    console.error(`/${i.commandName}: ${text(fehler)}`);
    const antwort = { content: fehlgeschlagen, flags: MessageFlags.Ephemeral } as const;
    const senden = i.deferred && !i.replied ? i.editReply({ content: fehlgeschlagen }) : i.replied ? i.followUp(antwort) : i.reply(antwort);
    await senden.catch((e: unknown) => console.error(`/${i.commandName}: Antwort fehlgeschlagen: ${text(e)}`));
  }
}

// Antwortet auf Autocomplete mit den Vorschlägen der Option, höchstens 25.
// Ohne `an`, ohne Server oder ohne Vorschläge eine leere Liste.
// Siehe docs/benutzung/managed-commands.md, „Grund“.
export async function schlageVor(i: AutocompleteInteraction, befehle: readonly Befehl[], an: boolean): Promise<void> {
  const fokus = i.options.getFocused(true);
  const option = befehle.find((b) => b.name === i.commandName)?.optionen?.find((o) => o.name === fokus.name);
  let vorschlaege: Vorschlag[] = [];
  try {
    if (an && i.inCachedGuild() && option?.art === 'text' && option.vorschlaege) vorschlaege = await option.vorschlaege(fokus.value, serverVon(i.guild));
  } catch (fehler) {
    console.error(`/${i.commandName}: Vorschläge fehlgeschlagen: ${text(fehler)}`);
  }
  await i
    .respond(vorschlaege.slice(0, 25).map((v) => ({ name: v.name, value: v.wert })))
    .catch((fehler: unknown) => console.error(`/${i.commandName}: Vorschläge nicht gesendet: ${text(fehler)}`));
}
