import type { Auswahl, Formular, Menue } from '../../discord/menue.js';

// Festes Präfix in `custom_id`: Daran erkennt `interactionCreate` das Menü,
// auch nach einem Neustart. Siehe docs/bot/sprachraeume-menue.md, „Knöpfe“.
export const praefix = 'sprachraum:';

// Zwölf Knöpfe in drei Action Rows: Zugang, Raum, Mitglieder. Je Knopf
// Aktion, Text und ein Emoji davor, damit man ihn ohne Lesen erkennt; bei
// 👁, ✏, ℹ und 🕊 gehört U+FE0F dazu, wie Discord diese Emoji führt.
// Siehe docs/benutzung/sprachraeume.md, „Menü“.
const reihen = [
  [
    ['sperren', 'Sperren', '🔒'],
    ['entsperren', 'Entsperren', '🔓'],
    ['verstecken', 'Verstecken', '👻'],
    ['zeigen', 'Zeigen', '👁\uFE0F'],
  ],
  [
    ['umbenennen', 'Umbenennen', '✏\uFE0F'],
    ['limit', 'Limit', '👥'],
    ['uebernehmen', 'Übernehmen', '👑'],
    ['info', 'Info', 'ℹ\uFE0F'],
  ],
  [
    ['rauswerfen', 'Rauswerfen', '👢'],
    ['bannen', 'Bannen', '🔨'],
    ['entbannen', 'Entbannen', '🕊\uFE0F'],
    ['uebergeben', 'Besitz übergeben', '🤝'],
  ],
] as const;

export type Aktion = (typeof reihen)[number][number][0];
export type MitFormular = Extract<Aktion, 'umbenennen' | 'limit'>;
export type MitAuswahl = Extract<Aktion, 'rauswerfen' | 'bannen' | 'entbannen' | 'uebergeben'>;

export const aktionen: readonly Aktion[] = reihen.flat().map(([aktion]) => aktion);
export const mitFormular = (a: Aktion): a is MitFormular => a === 'umbenennen' || a === 'limit';
export const mitAuswahl = (a: Aktion): a is MitAuswahl => a === 'rauswerfen' || a === 'bannen' || a === 'entbannen' || a === 'uebergeben';

// Die Nachricht im Textchat eines neuen Raums; die Discord-Schicht baut die Knöpfe.
export function menue(): Menue {
  return {
    text:
      '## Dein Sprachraum\n' +
      'Der Besitzer steuert den Raum mit den Knöpfen. „Übernehmen“ geht, wenn der Besitzer nicht im Raum ist, „Info“ für alle. ' +
      'Die Antworten sieht nur, wer drückt.',
    reihen: reihen.map((reihe) =>
      reihe.map(([aktion, text, emoji]) => ({ id: praefix + aktion, text, emoji, rot: aktion === 'rauswerfen' || aktion === 'bannen' })),
    ),
  };
}

const fragen: Record<MitAuswahl, string> = {
  rauswerfen: 'Wen willst du rauswerfen?',
  bannen: 'Wen willst du bannen?',
  entbannen: 'Wen willst du entbannen?',
  uebergeben: 'Wem willst du den Raum übergeben?',
};

// Die Nutzerauswahl von Discord; sie zeigt alle Mitglieder des Servers.
export function auswahl(aktion: MitAuswahl): Auswahl {
  return { id: praefix + aktion, frage: fragen[aktion], platzhalter: 'Mitglied wählen' };
}

// Das Formular für Umbenennen und Limit, mit dem Wert von jetzt. Das Feld heisst `wert`.
export function formular(aktion: MitFormular, raum: { name: string; limit: number }): Formular {
  const feld =
    aktion === 'umbenennen'
      ? { id: 'wert', label: 'Neuer Name', beschreibung: '1 bis 100 Zeichen', min: 1, max: 100, wert: raum.name }
      : { id: 'wert', label: 'Höchstens so viele im Raum', beschreibung: '0 bis 99; 0 heisst unbegrenzt', min: 1, max: 2, wert: String(raum.limit) };
  return { id: praefix + aktion, titel: aktion === 'umbenennen' ? 'Raum umbenennen' : 'Limit des Raums', feld };
}
