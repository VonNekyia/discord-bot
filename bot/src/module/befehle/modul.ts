import type { DiscordModul } from '../../discord/modul.js';
import { befehle, type Kontext } from './befehle.js';

// Das Modul Befehle: nur die allgemeinen Slash-Befehle, ohne Tabellen und
// Seiten. Siehe docs/benutzung/befehle.md.
export function befehleModul(k: Kontext): DiscordModul {
  return { name: 'befehle', befehle: befehle(k) };
}
