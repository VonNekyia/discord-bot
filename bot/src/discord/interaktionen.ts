import { MessageFlags, type Interaction } from 'discord.js';
import { uebersetzt } from './fehler.js';
import { alsAuswahl, alsModal, type Auswahl, type Formular } from './menue.js';
import { serverVon, type Server } from './server.js';

// Ein Druck auf einen Knopf, eine Wahl in der Nutzerauswahl oder ein
// abgeschicktes Formular, mit eigenen Typen. Jede Antwort ist ephemeral und
// erwähnt niemanden. Jeder Aufruf an Discord wirft `DiscordFehler`.
// Siehe docs/bot/sprachraeume-menue.md, „Antworten“.
export interface Druck {
  art: 'knopf' | 'auswahl' | 'formular';
  // `custom_id` ohne Präfix.
  aktion: string;
  server: Server;
  // Der Kanal, in dem der Knopf steht.
  kanal: string | null;
  nutzer: string;
  // Die ID des Bots.
  bot: string;
  // Bei der Auswahl: das gewählte Mitglied.
  ziel?: { id: string; bot: boolean };
  // Beim Formular: das Feld `wert`.
  wert?: string;
  // Hat der Bot schon geantwortet oder die Antwort aufgeschoben?
  readonly beantwortet: boolean;
  // Antwortet gleich.
  antworte(text: string): Promise<void>;
  zeigeAuswahl(a: Auswahl): Promise<void>;
  // Ein Formular muss die erste Antwort sein.
  zeigeFormular(f: Formular): Promise<void>;
  // Schiebt die Antwort auf: `deferReply`, bei der Auswahl `deferUpdate`.
  // Discord wartet höchstens 3 s auf die erste Antwort.
  warte(): Promise<void>;
  // Setzt die aufgeschobene Antwort, ohne Knöpfe; bei der Auswahl ersetzt sie die Auswahl.
  fertig(text: string): Promise<void>;
}

const ohneErwaehnung = { parse: [] };

// Ein Druck für das Menü mit `praefix` in `custom_id`; sonst undefined.
// Nur Knöpfe, Nutzerauswahl und Formulare auf einem Server im Cache.
export function alsDruck(i: Interaction, praefix: string): Druck | undefined {
  if (!(i.isButton() || i.isUserSelectMenu() || i.isModalSubmit()) || !i.inCachedGuild() || !i.customId.startsWith(praefix)) return undefined;
  const ziel = i.isUserSelectMenu() ? i.values[0] : undefined;
  return {
    art: i.isButton() ? 'knopf' : i.isUserSelectMenu() ? 'auswahl' : 'formular',
    aktion: i.customId.slice(praefix.length),
    server: serverVon(i.guild),
    kanal: i.channelId,
    nutzer: i.user.id,
    bot: i.client.user.id,
    ...(i.isUserSelectMenu() && ziel !== undefined ? { ziel: { id: ziel, bot: i.users.get(ziel)?.bot ?? false } } : {}),
    ...(i.isModalSubmit() ? { wert: i.fields.getTextInputValue('wert') } : {}),
    get beantwortet() {
      return i.deferred || i.replied;
    },
    async antworte(text) {
      await uebersetzt(() => i.reply({ content: text, flags: MessageFlags.Ephemeral, allowedMentions: ohneErwaehnung }));
    },
    async zeigeAuswahl(a) {
      await uebersetzt(() => i.reply({ ...alsAuswahl(a), flags: MessageFlags.Ephemeral }));
    },
    async zeigeFormular(f) {
      if (i.isModalSubmit()) throw new Error('auf ein Formular folgt kein Formular');
      await uebersetzt(() => i.showModal(alsModal(f)));
    },
    async warte() {
      await uebersetzt(() => (i.isUserSelectMenu() ? i.deferUpdate() : i.deferReply({ flags: MessageFlags.Ephemeral })));
    },
    async fertig(text) {
      await uebersetzt(() => i.editReply({ content: text, components: [], allowedMentions: ohneErwaehnung }));
    },
  };
}
