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
} from 'discord.js';

// Knöpfe, Nutzerauswahl und Formulare mit eigenen Typen; die Discord-Schicht
// baut daraus Components. Siehe docs/bot/sprachraeume-menue.md, „Knöpfe“.

export interface Knopf {
  // Die ganze `custom_id`.
  id: string;
  text: string;
  // Rot (`Danger`), sonst grau (`Secondary`).
  rot?: boolean;
}

export interface Menue {
  text: string;
  // Höchstens 5 Reihen mit je höchstens 5 Knöpfen.
  reihen: Knopf[][];
}

export interface Auswahl {
  id: string;
  frage: string;
  platzhalter: string;
}

export interface Formular {
  id: string;
  titel: string;
  // Ein Textfeld unter einem Label (Typ 18).
  feld: { id: string; label: string; beschreibung: string; min: number; max: number; wert: string };
}

// Die Nachricht mit den Knöpfen, ohne Erwähnungen.
export function alsNachricht(m: Menue): MessageCreateOptions {
  return {
    content: m.text,
    components: m.reihen.map((reihe) =>
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        reihe.map((k) =>
          new ButtonBuilder()
            .setCustomId(k.id)
            .setLabel(k.text)
            .setStyle(k.rot ? ButtonStyle.Danger : ButtonStyle.Secondary),
        ),
      ),
    ),
    allowedMentions: { parse: [] },
  };
}

// Die Frage mit der Nutzerauswahl von Discord; genau ein Mitglied.
export function alsAuswahl(a: Auswahl) {
  return {
    content: a.frage,
    components: [
      new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
        new UserSelectMenuBuilder().setCustomId(a.id).setPlaceholder(a.platzhalter).setMinValues(1).setMaxValues(1),
      ),
    ],
  };
}

export function alsModal(f: Formular): ModalBuilder {
  const feld = new TextInputBuilder()
    .setCustomId(f.feld.id)
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMinLength(f.feld.min)
    .setMaxLength(f.feld.max)
    .setValue(f.feld.wert);
  const label = new LabelBuilder().setLabel(f.feld.label).setDescription(f.feld.beschreibung).setTextInputComponent(feld);
  return new ModalBuilder().setCustomId(f.id).setTitle(f.titel).addLabelComponents(label);
}
