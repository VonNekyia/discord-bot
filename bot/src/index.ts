import type { Server } from 'node:http';
import { fileURLToPath } from 'node:url';
import { Events, type Client } from 'discord.js';
import { raeumeAuf } from './api/anmeldung.js';
import { apiUmgebung, erstelleApi, type ApiUmgebung } from './api/server.js';
import { text } from './kern/fehler.js';
import { Aufraeumen } from './kern/aufraeumen.js';
import { registriere } from './discord/befehle.js';
import { erstelleClient } from './discord/client.js';
import { dashboardGriff } from './discord/dashboard.js';
import { befehleVon, haengeAn } from './discord/modul.js';
import { textkanalAuf } from './discord/nachrichten.js';
import { serverVon } from './discord/server.js';
import { zaehleAnfragen } from './discord/zaehlen.js';
import { migriere, oeffne, verbindung } from './kern/datenbank.js';
import { Zaehlung } from './kern/zaehlung.js';
import { alleModule } from './modulliste.js';

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

// Zählt jede Anfrage an Discord, nur im Speicher. Siehe docs/bot/rate-limits.md, „Zählen“.
const zaehlung = new Zaehlung();
const client = erstelleClient();
zaehleAnfragen(client.rest, zaehlung);
// Die Module; ihre Seiten kommen in dieser Reihenfolge als Tabs ins
// Dashboard. Die Begrüssung sieht Kanäle nur über die Discord-Schicht.
// Siehe docs/entwicklung/struktur.md, „Ein Modul“.
const modulListe = alleModule({ db, zaehlung, kanal: textkanalAuf(client) });
// Ihre Tabellen löscht `aufraeumer`, wenn der Bot einen Server verlässt.
const aufraeumer = new Aufraeumen(modulListe);
let api: Server | undefined;

// Was nach dem Verbinden läuft. Scheitert es unerwartet, endet der Prozess,
// und der Dienst startet ihn neu. Siehe docs/bot/wiederanlauf.md, „Was der Bot loggt“.
async function nachDemVerbinden(bereit: Client<true>): Promise<void> {
  console.log('Verbunden.');
  await registriere(bereit.rest, bereit.application.id, befehleVon(modulListe)).catch((e: unknown) =>
    console.error(`Befehle nicht registriert: ${text(e)}`),
  );
  // Server, die den Bot entfernt haben, während er aus war.
  // Siehe docs/benutzung/begruessung.md, „Wenn etwas fehlt“.
  const shards = bereit.shard && { ids: bereit.shard.ids, count: bereit.shard.count };
  await aufraeumer.behalteNur(db, [...bereit.guilds.cache.keys()], shards ?? undefined).then(
    (n) => n > 0 && console.log(`Einstellungen von ${n} verlassenen Servern gelöscht.`),
    (e: unknown) => console.error(`Abgleich der Server fehlgeschlagen: ${text(e)}`),
  );
  // Danach gleichen die Module ab, etwa die Räume, mit den Servern dieses
  // Prozesses. Siehe docs/bot/sprachraeume-bau.md, „Abgleich beim Start“.
  const server = bereit.guilds.cache.map(serverVon);
  // Modul für Modul, nacheinander.
  // oxlint-disable-next-line no-await-in-loop
  for (const m of modulListe) await m.ereignisse?.bereit?.(server);
  if (!umgebung) return;
  // Nur auf 127.0.0.1; von aussen kommt man über serve.mjs oder den Reverse Proxy.
  // Siehe docs/schnittstelle/api.md, „Lokal“.
  const { port, ...rest } = umgebung;
  // Die Seiten des Dashboards, in der Reihenfolge der Tabs. Siehe docs/schnittstelle/baukasten.md.
  const bereiche = modulListe.flatMap((m) => (m.bereich ? [m.bereich] : []));
  api = erstelleApi({ griff: dashboardGriff(bereit, { zaehlung }), db, anwendung: bereit.application.id, zaehlung, bereiche, ...rest });
  api.once('error', (e) => console.error(`API nicht gestartet: ${text(e)}`));
  api.listen(port, '127.0.0.1', () => console.log(`API auf 127.0.0.1:${port}.`));
  // Abgelaufene Sitzungen löschen. Siehe docs/schnittstelle/anmeldung.md, „Sitzung“.
  const aufraeumen = () => void raeumeAuf(db).catch((e: unknown) => console.error(`Sitzungen nicht aufgeräumt: ${text(e)}`));
  aufraeumen();
  setInterval(aufraeumen, 60 * 60 * 1000).unref();
}

client.once(Events.ClientReady, (bereit) => {
  nachDemVerbinden(bereit).catch((e: unknown) => {
    console.error(`Start fehlgeschlagen: ${text(e)}`);
    process.exit(1);
  });
});

client.on(Events.GuildDelete, (guild) => {
  for (const m of modulListe) m.vergiss?.(guild.id);
  void aufraeumer.vergiss(db, guild.id).catch((e: unknown) => console.error(`Server verlassen: ${text(e)}`));
});

// Beitritt, Abschied, Sprachkanäle, gelöschte Kanäle, Befehle und Knöpfe
// gehen an die Module. Siehe docs/entwicklung/struktur.md, „Ein Modul“.
haengeAn(client, modulListe);

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
