import { MessageFlags, Routes, SlashCommandBuilder, type ChatInputCommandInteraction, type REST } from 'discord.js';
import { text } from '../kern/fehler.js';
import { uebersetzt } from './fehler.js';

// Ein Aufruf eines Slash-Befehls mit eigenen Typen. Jede Antwort ist
// ephemeral und erwähnt niemanden. Jeder Aufruf an Discord wirft `DiscordFehler`.
// Siehe docs/benutzung/befehle.md, „Antwortzeit“.
export interface Aufruf {
  // Antwortet gleich; Discord wartet höchstens 3 s auf die erste Antwort.
  antworte(inhalt: string): Promise<void>;
}

// Ein Slash-Befehl: wie Discord ihn zeigt und was er tut. Der Name ist
// klein, ohne `/`. Siehe docs/benutzung/befehle.md.
export interface Befehl {
  name: string;
  beschreibung: string;
  ausfuehren(aufruf: Aufruf): Promise<void>;
}

const ohneErwaehnung = { parse: [] };

// Der Satz, wenn etwas schiefgeht. Siehe docs/benutzung/befehle.md, „Fehler“.
export const fehlgeschlagen = 'Das hat nicht geklappt.';

// Ersetzt alle globalen Befehle der Anwendung mit einem Aufruf.
// Siehe docs/bot/rate-limits.md, „Befehle registrieren“.
export async function registriere(rest: REST, anwendung: string, befehle: readonly Befehl[]): Promise<void> {
  const body = befehle.map((b) => new SlashCommandBuilder().setName(b.name).setDescription(b.beschreibung).toJSON());
  await rest.put(Routes.applicationCommands(anwendung), { body });
}

// Führt den Befehl aus `befehle` aus, den `i` aufruft. Schlägt er fehl,
// sieht der Nutzer eine kurze Meldung, und ins Log geht nur der Befehl und
// der Fehlertext. Siehe docs/bot/datenschutz.md, „Was ins Log geht“.
export async function beantworte(i: ChatInputCommandInteraction, befehle: readonly Befehl[]): Promise<void> {
  const befehl = befehle.find((b) => b.name === i.commandName);
  const aufruf: Aufruf = {
    async antworte(inhalt) {
      await uebersetzt(() => i.reply({ content: inhalt, flags: MessageFlags.Ephemeral, allowedMentions: ohneErwaehnung }));
    },
  };
  try {
    if (!befehl) throw new Error('unbekannter Befehl');
    await befehl.ausfuehren(aufruf);
  } catch (fehler) {
    console.error(`/${i.commandName}: ${text(fehler)}`);
    const antwort = { content: fehlgeschlagen, flags: MessageFlags.Ephemeral } as const;
    const senden = i.replied || i.deferred ? i.followUp(antwort) : i.reply(antwort);
    await senden.catch((e: unknown) => console.error(`/${i.commandName}: Antwort fehlgeschlagen: ${text(e)}`));
  }
}
