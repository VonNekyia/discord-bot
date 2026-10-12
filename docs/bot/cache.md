---
title: Cache
description: Wann der Bot Daten aus der Datenbank im Speicher hält und wann nicht; ladeCache, Standardwerte, Invalidierung, Grenzen.
code:
  - bot/src/kern/cache.ts
  - bot/src/module/begruessung/modul.ts
  - bot/src/module/sprachraeume/modul.ts
---

# Cache

`ladeCache` in `bot/src/kern/cache.ts` hält Werte aus der Datenbank im
Speicher: begrenzte Grösse, Ablaufzeit, und
ein fehlender Wert wird beim ersten Zugriff geladen. Darunter liegt
`lru-cache`, siehe Entscheidung [0006](../entscheidungen/0006-lru-cache.md).
Heute nutzen ihn die Begrüssung und die Sprachräume: `einstellungen` in
`bot/src/module/begruessung/modul.ts` und `sprachraeume` in
`bot/src/module/sprachraeume/modul.ts` halten die Einstellungen je Server;
jeder Beitritt und Abschied und jedes Betreten eines Sprachkanals liest
sie dort. Die API ruft nach jedem Schreiben `delete`.

## Wann cachen

Ein Cache lohnt sich, wenn alles davon stimmt:

- Der Wert wird oft gelesen, etwa bei jeder Interaktion eines Servers.
- Er wird selten geschrieben, und nur vom Bot selbst.
- Ein Wert, der bis zur Ablaufzeit veraltet ist, schadet nicht, oder jeder
  Schreibpfad ruft `delete`.

Kein Cache für:

- Zähler, Ranglisten und alles, was bei jeder Interaktion geschrieben wird.
- Rechte und Sperren. Hier gilt immer der Stand der Datenbank.
- Daten, die ein anderer Prozess ändert, solange es keine Invalidierung
  über Prozesse hinweg gibt.
- Einmalige Abfragen. Der Pool ist schnell genug.

Daten über Nutzer im Cache stehen auch auf der Datenschutzseite, mit ihrer
Ablaufzeit.

## So geht es

```ts
const einstellungen = ladeCache((server: string) => leseEinstellungen(db, server));

const werte = await einstellungen.fetch(interaction.guildId);
await schreibeEinstellungen(db, server, neu);
einstellungen.delete(server);
```

- `fetch` lädt einen fehlenden oder abgelaufenen Wert. Fragen mehrere
  Interaktionen gleichzeitig nach demselben Schlüssel, lädt nur eine.
- Wer schreibt, ruft danach `delete`. Der nächste `fetch` lädt neu.
- Gibt `laden` `undefined` zurück, wird nichts gespeichert. Für „keine
  Zeile“ ist ein Standardwert besser, sonst fragt jeder Zugriff erneut.

## Standardwerte

| Wert | Standard | Bedeutung |
|---|---|---|
| `max` | 10 000 | so viele Schlüssel höchstens; der am längsten nicht genutzte fällt heraus |
| `ttl` | 10 min | danach lädt `fetch` neu |

Beide lassen sich je Cache ändern: `ladeCache(laden, { max, ttl })`.

## Grenzen

Jeder Prozess hat seinen eigenen Cache. Laufen einmal mehrere Instanzen,
sieht eine Instanz das `delete` der anderen nicht und liefert bis zu `ttl`
lang den alten Wert.
