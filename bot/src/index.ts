import { fileURLToPath } from 'node:url';
import { Client, Events, GatewayIntentBits } from 'discord.js';
import { beantworte, registriere, text } from './befehle.js';
import { migriere, oeffne, verbindung } from './datenbank.js';

const token = process.env.DISCORD_BOT_TOKEN;
if (!token) {
  console.error('DISCORD_BOT_TOKEN fehlt. Siehe bot/.env.example.');
  process.exit(1);
}

const ziel = verbindung();
if (!ziel) {
  console.error('DB_HOST, DB_NAME, DB_USER oder DB_PASSWORD fehlt. Siehe bot/.env.example.');
  process.exit(1);
}
const neu = await migriere(ziel, fileURLToPath(new URL('../migrationen', import.meta.url))).catch((e: unknown) => {
  console.error(`Migration fehlgeschlagen: ${text(e)}`);
  process.exit(1);
});
if (neu.length > 0) console.log(`Migriert: ${neu.join(', ')}.`);
const db = oeffne(ziel);

// Slash-Befehle brauchen nur Guilds. Siehe docs/bot/intents.md.
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, async (bereit) => {
  console.log('Verbunden.');
  await registriere(bereit.rest, bereit.application.id).catch((e: unknown) =>
    console.error(`Befehle nicht registriert: ${text(e)}`),
  );
});

client.on(Events.InteractionCreate, (interaction) => {
  if (interaction.isChatInputCommand()) void beantworte(interaction, { db });
});

// discord.js verbindet sich selbst neu. Gibt es auf, endet der Prozess, und
// der Dienst startet ihn neu. Siehe docs/bot/wiederanlauf.md.
client.on(Events.ShardReconnecting, (shard) => console.log(`Shard ${shard}: verbinde neu.`));
client.on(Events.ShardResume, (shard) => console.log(`Shard ${shard}: wieder verbunden.`));
client.on(Events.ShardDisconnect, (ereignis, shard) => {
  console.error(`Shard ${shard}: getrennt mit Code ${ereignis.code}, beende.`);
  process.exit(1);
});
client.on(Events.Error, (e) => console.error(`Fehler: ${text(e)}`));

// Beim Beenden erst Discord, dann den Pool schliessen. Siehe docs/bot/datenbank.md, „Pool“.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void client.destroy().then(() => db.end()).finally(() => process.exit(0));
  });
}

await client.login(token);
