import { OverwriteType, PermissionFlagsBits as P, type PermissionOverwrites } from 'discord.js';

// Rechte und Rechte-Einträge mit eigenen Typen. Die Bits sind die von Discord
// ([Permissions](https://docs.discord.com/developers/topics/permissions)).
// Siehe docs/entwicklung/struktur.md, „Die Discord-Schicht“.
export const Recht = {
  sehen: P.ViewChannel,
  verbinden: P.Connect,
  senden: P.SendMessages,
  verlauf: P.ReadMessageHistory,
} as const;

// Ein Rechte-Eintrag eines Kanals: für eine Rolle (auch @everyone) oder eine Person.
export interface Eintrag {
  id: string;
  art: 'rolle' | 'person';
  allow: bigint;
  deny: bigint;
}

export function alsEintrag(o: PermissionOverwrites): Eintrag {
  return { id: o.id, art: o.type === OverwriteType.Role ? 'rolle' : 'person', allow: o.allow.bitfield, deny: o.deny.bitfield };
}

// Für `permissionOverwrites` beim Anlegen und Setzen.
export function alsOverwrite(e: Eintrag): { id: string; type: OverwriteType; allow: bigint; deny: bigint } {
  return { id: e.id, type: e.art === 'rolle' ? OverwriteType.Role : OverwriteType.Member, allow: e.allow, deny: e.deny };
}
