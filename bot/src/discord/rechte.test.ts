import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PermissionFlagsBits as P } from 'discord.js';
import { darfVerwalten } from './rechte.js';

// Das Bitfeld aus /users/@me/guilds, ohne Netz.
// Siehe docs/bot/dashboard-api.md, „Server der Sitzung“.
test('darfVerwalten: „Server verwalten“ oder „Administrator“; ein ungültiges Bitfeld heisst nein, ohne zu werfen', () => {
  const faelle: [string, boolean][] = [
    [String(P.ManageGuild), true],
    [String(P.Administrator), true],
    [String(P.ManageGuild | P.SendMessages), true],
    [String(P.SendMessages), false],
    ['0', false],
    // Grösser als 2^64: BigInt rechnet weiter.
    [String((1n << 70n) | P.Administrator), true],
    ['', false],
    ['viel', false],
    [' 32', false],
    ['-32', false],
    ['0x20', false],
    ['32.0', false],
  ];
  for (const [rechte, erwartet] of faelle) assert.equal(darfVerwalten(rechte), erwartet, JSON.stringify(rechte));
});
