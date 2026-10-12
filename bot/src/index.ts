import type { Server } from 'node:http';
import { fileURLToPath } from 'node:url';
import { Events, type Client } from 'discord.js';
import { raeumeAuf } from './api/anmeldung.js';
import { apiUmgebung, erstelleApi, type ApiUmgebung } from './api/server.js';
import { beantworte, registriere } from './module/befehle/befehle.js';
import { text } from './kern/fehler.js';
import { behalteNur, vergiss } from './kern/aufraeumen.js';
import { lese } from './module/begruessung/begruessung.js';
import { ladeCache } from './kern/cache.js';
import { erstelleClient } from './discord/client.js';
import { alsMitglied, textkanalAuf } from './discord/nachrichten.js';
import { serverVon } from './discord/server.js';
import { zaehleAnfragen } from './discord/zaehlen.js';
import { migriere, oeffne, verbindung } from './kern/datenbank.js';
import { Zaehlung } from './kern/zaehlung.js';
import { istMenue, Knoepfe } from './module/sprachraeume/knoepfe.js';
import { Raeume } from './module/sprachraeume/raeume.js';
import { begruesse, erstelleBremse } from './module/begruessung/senden.js';
import { begruessungsBereich } from './module/begruessung/seiten.js';
import { liesSprachraeume } from './module/sprachraeume/sprachraeume.js';
import { sprachraeumeBereich } from './module/sprachraeume/seiten.js';

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
// Die Einstellungen liest jeder Beitritt und Abschied; wer sie ändert, löscht
// den Server hier. Siehe docs/bot/cache.md, „Wann cachen“.
const einstellungen = ladeCache((server: string) => lese(db, server));
// Ebenso die Sprachräume, gelesen bei jedem Betreten eines Sprachkanals.
const sprachraeume = ladeCache((server: string) => liesSprachraeume(db, server));
const raeume = new Raeume({ db, einstellungen: sprachraeume });
const knoepfe = new Knoepfe({ db });

// Zählt jede Anfrage an Discord, nur im Speicher. Siehe docs/bot/rate-limits.md, „Zählen“.
const zaehlung = new Zaehlung();
const client = erstelleClient();
zaehleAnfragen(client.rest, zaehlung);
let api: Server | undefined;

// Was nach dem Verbinden läuft. Scheitert es unerwartet, endet der Prozess,
// und der Dienst startet ihn neu. Siehe docs/bot/wiederanlauf.md, „Was der Bot loggt“.
async function nachDemVerbinden(bereit: Client<true>): Promise<void> {
  console.log('Verbunden.');
  await registriere(bereit.rest, bereit.application.id).catch((e: unknown) =>
    console.error(`Befehle nicht registriert: ${text(e)}`),
  );
  // Server, die den Bot entfernt haben, während er aus war.
  // Siehe docs/benutzung/begruessung.md, „Wenn etwas fehlt“.
  const shards = bereit.shard && { ids: bereit.shard.ids, count: bereit.shard.count };
  await behalteNur(db, [...bereit.guilds.cache.keys()], shards ?? undefined).then(
    (n) => n > 0 && console.log(`Einstellungen von ${n} verlassenen Servern gelöscht.`),
    (e: unknown) => console.error(`Abgleich der Server fehlgeschlagen: ${text(e)}`),
  );
  // Räume, die es nicht mehr gibt, vergessen; leere löschen.
  // Siehe docs/bot/sprachraeume-bau.md, „Abgleich beim Start“.
  await raeume.gleicheAb(bereit.guilds.cache.map(serverVon)).catch((e: unknown) => console.error(`Abgleich der Räume fehlgeschlagen: ${text(e)}`));
  if (!umgebung) return;
  // Nur auf 127.0.0.1; von aussen kommt man über serve.mjs oder den Reverse Proxy.
  // Siehe docs/schnittstelle/api.md, „Lokal“.
  const { port, ...rest } = umgebung;
  // Die Seiten des Dashboards, in der Reihenfolge der Tabs. Siehe docs/schnittstelle/baukasten.md.
  const bereiche = [begruessungsBereich({ db, einstellungen, zaehlung }), sprachraeumeBereich({ db, sprachraeume })];
  api = erstelleApi({ client: bereit, db, anwendung: bereit.application.id, zaehlung, bereiche, ...rest });
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
  einstellungen.delete(guild.id);
  sprachraeume.delete(guild.id);
  void vergiss(db, guild.id).catch((e: unknown) => console.error(`Server verlassen: ${text(e)}`));
});

// Eine Bremse für alle Server, im Speicher. Siehe docs/benutzung/begruessung.md, „Bremse“.
// Die Begrüssung sieht Mitglieder und Kanäle nur über die Discord-Schicht.
const textkanalVon = textkanalAuf(client);
const senden = { db, einstellungen, kanal: textkanalVon, bremse: erstelleBremse({ einstellungen, kanal: textkanalVon }), zaehlung };
client.on(Events.GuildMemberAdd, (mitglied) => void begruesse(alsMitglied(mitglied), 'beitritt', senden));
client.on(Events.GuildMemberRemove, (mitglied) => void begruesse(alsMitglied(mitglied), 'abschied', senden));

// Siehe docs/benutzung/sprachraeume.md.
client.on(Events.VoiceStateUpdate, (vorher, nachher) => {
  void raeume.aenderung(serverVon(nachher.guild), nachher.id, vorher.channelId, nachher.channelId);
});
client.on(Events.ChannelDelete, (kanal) => {
  if (!kanal.isDMBased()) void raeume.geloescht(kanal.id).catch((e: unknown) => console.error(`Sprachraum: nicht vergessen: ${text(e)}`));
});

client.on(Events.InteractionCreate, (interaction) => {
  if (interaction.isChatInputCommand()) void beantworte(interaction, { db });
  // Das Menü der Sprachräume, erkannt am Präfix in `custom_id`. Siehe docs/bot/sprachraeume-menue.md, „Knöpfe“.
  else if (istMenue(interaction)) void knoepfe.bediene(interaction);
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
