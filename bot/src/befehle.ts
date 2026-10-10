import { MessageFlags, REST, Routes, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';

// Ein Slash-Befehl: wie Discord ihn zeigt und was er tut.
// Siehe docs/benutzung/befehle.md.
export interface Befehl {
  daten: SlashCommandBuilder;
  ausfuehren(interaction: ChatInputCommandInteraction): Promise<unknown>;
}

export const befehle: Befehl[] = [
  {
    daten: new SlashCommandBuilder().setName('ping').setDescription('Prüft, ob der Bot antwortet.'),
    ausfuehren: (interaction) => interaction.reply({ content: 'Pong.', flags: MessageFlags.Ephemeral }),
  },
];

// Ersetzt alle globalen Befehle der Anwendung mit einem Aufruf.
// Siehe docs/bot/rate-limits.md, „Befehle registrieren“.
export async function registriere(rest: REST, anwendung: string): Promise<void> {
  await rest.put(Routes.applicationCommands(anwendung), { body: befehle.map((b) => b.daten.toJSON()) });
}

// Führt einen Befehl aus. Schlägt er fehl, sieht der Nutzer eine kurze
// Meldung, und ins Log geht nur der Befehl und der Fehlertext.
// Siehe docs/bot/datenschutz.md, „Was ins Log geht“.
export async function beantworte(interaction: ChatInputCommandInteraction): Promise<void> {
  const befehl = befehle.find((b) => b.daten.name === interaction.commandName);
  try {
    if (!befehl) throw new Error('unbekannter Befehl');
    await befehl.ausfuehren(interaction);
  } catch (fehler) {
    console.error(`/${interaction.commandName}: ${text(fehler)}`);
    const antwort = { content: 'Das hat nicht geklappt.', flags: MessageFlags.Ephemeral } as const;
    const senden = interaction.replied || interaction.deferred ? interaction.followUp(antwort) : interaction.reply(antwort);
    await senden.catch((e: unknown) => console.error(`/${interaction.commandName}: Antwort fehlgeschlagen: ${text(e)}`));
  }
}

// Nur die Meldung: Fehler von discord.js tragen in `url` den Token der Interaktion.
export function text(fehler: unknown): string {
  return fehler instanceof Error ? fehler.message : String(fehler);
}
