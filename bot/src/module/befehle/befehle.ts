import type { Pool } from 'pg';
import type { Befehl } from '../../discord/befehle.js';
import { misse } from '../../kern/datenbank.js';
import { text } from '../../kern/fehler.js';

// Was die Befehle ausser dem Aufruf brauchen.
export interface Kontext {
  db: Pick<Pool, 'query'>;
}

// Die Slash-Befehle des Bots. Registrieren und beantworten tut die
// Discord-Schicht (`discord/befehle.ts`). Siehe docs/benutzung/befehle.md.
export function befehle({ db }: Kontext): Befehl[] {
  return [
    {
      name: 'ping',
      beschreibung: 'Prüft, ob Bot und Datenbank antworten.',
      ausfuehren: async (aufruf) => {
        const datenbank = await misse(db).then(
          (ms) => `${ms} ms`,
          (e: unknown) => {
            console.error(`/ping: Datenbank: ${text(e)}`);
            return 'nicht erreichbar';
          },
        );
        await aufruf.antworte(`Pong. Datenbank: ${datenbank}.`);
      },
    },
  ];
}
