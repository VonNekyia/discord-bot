import { PermissionFlagsBits as R, type GuildMember, type User } from 'discord.js';

// Wer etwas tut und wen es trifft, mit eigenen Typen; die Regeln dazu
// stehen auch unter „Ziel“. Siehe docs/benutzung/managed-commands.md, „Wer darf“.

// Eine Person bei Discord, auf einem Server oder nicht.
export interface Person {
  id: string;
  // Anzeigename auf dem Server, sonst globaler Name, sonst Nutzername.
  name: string;
  benutzername: string;
  bot: boolean;
}

// Wo ein Mitglied auf seinem Server steht.
export interface Rang {
  eigentuemer: boolean;
  // Hat „Administrator“, auch über eine Rolle.
  admin: boolean;
  // Die IDs seiner Rollen, ohne `@everyone`.
  rollen: string[];
  // Die Position seiner höchsten Rolle; 0 ist `@everyone`.
  hoechste: number;
}

export function personVon(user: User, mitglied?: GuildMember): Person {
  return { id: user.id, name: mitglied?.displayName ?? user.displayName, benutzername: user.username, bot: user.bot };
}

export function rangVon(m: GuildMember): Rang {
  return {
    eigentuemer: m.guild.ownerId === m.id,
    admin: m.permissions.has(R.Administrator),
    rollen: m.roles.cache.filter((r) => r.id !== m.guild.id).map((r) => r.id),
    hoechste: m.roles.highest.position,
  };
}
