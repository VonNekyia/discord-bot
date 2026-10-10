import { Client, Events, GatewayIntentBits } from 'discord.js';
import { beantworte, registriere, text } from './befehle.js';

if (!process.env.DISCORD_TOKEN) {
  console.error('DISCORD_TOKEN fehlt. Siehe bot/.env.example.');
  process.exit(1);
}

// Slash-Befehle brauchen nur Guilds. Siehe docs/bot/intents.md.
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, async (bereit) => {
  console.log('Verbunden.');
  await registriere(bereit.rest, bereit.application.id).catch((e: unknown) =>
    console.error(`Befehle nicht registriert: ${text(e)}`),
  );
});

client.on(Events.InteractionCreate, (interaction) => {
  if (interaction.isChatInputCommand()) void beantworte(interaction);
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

await client.login();
