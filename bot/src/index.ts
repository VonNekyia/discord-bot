import type { Server } from 'node:http';
import { fileURLToPath } from 'node:url';
import { Events } from 'discord.js';
import { raeumeAuf } from './anmeldung.js';
import { apiUmgebung, erstelleApi, type ApiUmgebung } from './api.js';
import { beantworte, registriere, text } from './befehle.js';
import { behalteNur, vergiss } from './begruessung.js';
import { erstelleClient } from './client.js';
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

let umgebung: ApiUmgebung | undefined;
try {
  umgebung = apiUmgebung();
} catch (e) {
  console.error(text(e));
  process.exit(1);
}
if (!umgebung) console.log('DISCORD_CLIENT_SECRET oder DASHBOARD_URL fehlt: der Bot startet ohne API.');

const neu = await migriere(ziel, fileURLToPath(new URL('../migrationen', import.meta.url))).catch((e: unknown) => {
  console.error(`Migration fehlgeschlagen: ${text(e)}`);
  process.exit(1);
});
if (neu.length > 0) console.log(`Migriert: ${neu.join(', ')}.`);
const db = oeffne(ziel);

const client = erstelleClient();
let api: Server | undefined;

client.once(Events.ClientReady, async (bereit) => {
  console.log('Verbunden.');
  await registriere(bereit.rest, bereit.application.id).catch((e: unknown) =>
    console.error(`Befehle nicht registriert: ${text(e)}`),
  );
  // Server, die den Bot entfernt haben, während er aus war.
  // Siehe docs/benutzung/begruessung.md, „Wenn etwas fehlt“.
  await behalteNur(db, [...bereit.guilds.cache.keys()]).then(
    (n) => n > 0 && console.log(`Einstellungen von ${n} verlassenen Servern gelöscht.`),
    (e: unknown) => console.error(`Abgleich der Server fehlgeschlagen: ${text(e)}`),
  );
  if (!umgebung) return;
  // Nur auf 127.0.0.1; von aussen kommt man über serve.mjs oder den Reverse Proxy.
  // Siehe docs/schnittstelle/api.md, „Lokal“.
  const { port, ...rest } = umgebung;
  api = erstelleApi({ client: bereit, db, anwendung: bereit.application.id, ...rest });
  api.once('error', (e) => console.error(`API nicht gestartet: ${text(e)}`));
  api.listen(port, '127.0.0.1', () => console.log(`API auf 127.0.0.1:${port}.`));
  // Abgelaufene Sitzungen löschen. Siehe docs/schnittstelle/anmeldung.md, „Sitzung“.
  const aufraeumen = () => void raeumeAuf(db).catch((e: unknown) => console.error(`Sitzungen nicht aufgeräumt: ${text(e)}`));
  aufraeumen();
  setInterval(aufraeumen, 60 * 60 * 1000).unref();
});

client.on(Events.GuildDelete, (guild) => {
  void vergiss(db, guild.id).catch((e: unknown) => console.error(`Server verlassen: ${text(e)}`));
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

// Beim Beenden erst die API, dann Discord, dann den Pool schliessen.
// Siehe docs/bot/datenbank.md, „Pool“.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    const apiZu = new Promise<void>((fertig) => (api?.listening ? api.close(() => fertig()) : fertig()));
    void apiZu
      .then(() => client.destroy())
      .then(() => db.end())
      .finally(() => process.exit(0));
  });
}

await client.login(token);
