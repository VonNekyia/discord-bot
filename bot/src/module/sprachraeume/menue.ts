import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  LabelBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
  type MessageCreateOptions,
  type VoiceChannel,
} from 'discord.js';

// Festes Präfix in `custom_id`: Daran erkennt `interactionCreate` das Menü,
// auch nach einem Neustart. Siehe docs/bot/sprachraeume-menue.md, „Knöpfe“.
export const praefix = 'sprachraum:';

// Zwölf Knöpfe in drei Action Rows: Zugang, Raum, Mitglieder.
// Siehe docs/benutzung/sprachraeume.md, „Menü“.
const reihen = [
  [
    ['sperren', 'Sperren'],
    ['entsperren', 'Entsperren'],
    ['verstecken', 'Verstecken'],
    ['zeigen', 'Zeigen'],
  ],
  [
    ['umbenennen', 'Umbenennen'],
    ['limit', 'Limit'],
    ['uebernehmen', 'Übernehmen'],
    ['info', 'Info'],
  ],
  [
    ['rauswerfen', 'Rauswerfen'],
    ['bannen', 'Bannen'],
    ['entbannen', 'Entbannen'],
    ['uebergeben', 'Besitz übergeben'],
  ],
] as const;

export type Aktion = (typeof reihen)[number][number][0];
export type MitFormular = Extract<Aktion, 'umbenennen' | 'limit'>;
export type MitAuswahl = Extract<Aktion, 'rauswerfen' | 'bannen' | 'entbannen' | 'uebergeben'>;

export const aktionen: readonly Aktion[] = reihen.flat().map(([aktion]) => aktion);
export const mitFormular = (a: Aktion): a is MitFormular => a === 'umbenennen' || a === 'limit';
export const mitAuswahl = (a: Aktion): a is MitAuswahl => a === 'rauswerfen' || a === 'bannen' || a === 'entbannen' || a === 'uebergeben';

// Die Nachricht im Textchat eines neuen Raums.
export function menue(): MessageCreateOptions {
  return {
    content:
      '## Dein Sprachraum\n' +
      'Der Besitzer steuert den Raum mit den Knöpfen. „Übernehmen“ geht, wenn der Besitzer nicht im Raum ist, „Info“ für alle. ' +
      'Die Antworten sieht nur, wer drückt.',
    components: reihen.map((reihe) =>
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        reihe.map(([aktion, text]) =>
          new ButtonBuilder()
            .setCustomId(praefix + aktion)
            .setLabel(text)
            .setStyle(aktion === 'rauswerfen' || aktion === 'bannen' ? ButtonStyle.Danger : ButtonStyle.Secondary),
        ),
      ),
    ),
    allowedMentions: { parse: [] },
  };
}

const fragen: Record<MitAuswahl, string> = {
  rauswerfen: 'Wen willst du rauswerfen?',
  bannen: 'Wen willst du bannen?',
  entbannen: 'Wen willst du entbannen?',
  uebergeben: 'Wem willst du den Raum übergeben?',
};

// Die Nutzerauswahl von Discord; sie zeigt alle Mitglieder des Servers.
export function auswahl(aktion: MitAuswahl) {
  return {
    content: fragen[aktion],
    components: [
      new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
        new UserSelectMenuBuilder().setCustomId(praefix + aktion).setPlaceholder('Mitglied wählen').setMinValues(1).setMaxValues(1),
      ),
    ],
  };
}

// Das Formular für Umbenennen und Limit, mit dem Wert von jetzt. Das Feld heisst `wert`.
export function formular(aktion: MitFormular, raum: VoiceChannel): ModalBuilder {
  const feld = new TextInputBuilder().setCustomId('wert').setStyle(TextInputStyle.Short).setRequired(true);
  const label = new LabelBuilder();
  if (aktion === 'umbenennen') {
    feld.setMinLength(1).setMaxLength(100).setValue(raum.name);
    label.setLabel('Neuer Name').setDescription('1 bis 100 Zeichen');
  } else {
    feld.setMinLength(1).setMaxLength(2).setValue(String(raum.userLimit));
    label.setLabel('Höchstens so viele im Raum').setDescription('0 bis 99; 0 heisst unbegrenzt');
  }
  return new ModalBuilder()
    .setCustomId(praefix + aktion)
    .setTitle(aktion === 'umbenennen' ? 'Raum umbenennen' : 'Limit des Raums')
    .addLabelComponents(label.setTextInputComponent(feld));
}
