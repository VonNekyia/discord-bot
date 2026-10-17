---
title: Board der Module
description: Die Seite module im Baukasten; je Server jedes Modul an oder aus, gesperrt, solange ein bezahltes nicht freigeschaltet ist, ein Link in den Store von Discord, was gespeichert wird, wann die Tabs neu laden, wie ein ausgeschaltetes Modul antwortet und wo das Board im Bot lebt.
code:
  - bot/src/kern/baukasten.ts
  - bot/src/kern/modul.ts
  - bot/src/api/server.ts
  - bot/src/index.ts
  - bot/src/brett/brett.ts
  - bot/src/brett/freischaltung.ts
  - bot/src/discord/kaeufe.ts
  - bot/src/discord/modul.ts
---

# Board der Module

Auf dem Board schaltet das Team je Server die Module an und aus. Es ist
eine Seite im [Baukasten](baukasten.md) mit der ID `module` und dem Titel
„Module“, der letzte Tab. Ein Modul, das aus ist, tut auf dem Server
nichts, und seine Tabs fehlen; seine Einstellungen bleiben. Ein bezahltes
Modul geht nur an, wenn es auf dem Server freigeschaltet ist. Das Board ist kein Modul,
denn ein Modul kennt kein anderes, siehe „Im Bot“. Warum so, steht in
[0019](../entscheidungen/0019-module-an-und-aus.md). Routen, Typen,
Fehlerformat und Grenzen gelten wie im Baukasten und in
[API des Dashboards](api.md).

## Welche Module

| Modul | Schalter | Bezahlt | ohne gespeicherten Stand |
|---|---|---|---|
| Befehle (`/ping`) | keiner, immer an | nein | an |
| Begrüssung | `begruessung` | nein | an |
| Sprachräume | `sprachraeume` | nein | an |
| Managed Commands | `strafen`, kommt mit seinem Modul | ja, einmalig | aus |
| Log | `log`, kommt mit seinem Modul | frei, das Speichern in der Datenbank bezahlt | an |

- Ein Modul steht auf dem Board, wenn es einen Schalter anmeldet, siehe
  „Im Bot“. Befehle meldet keinen an.
- Freie Module sind ohne gespeicherten Stand an. Auf bestehenden Servern
  ändert sich so nichts.
- Ein bezahltes Modul ist an, wenn sein Schalter gespeichert an ist und
  es auf dem Server freigeschaltet ist. Endet die Freischaltung, etwa mit
  einem Abo, ist es aus; der gespeicherte Schalter bleibt. Kommt sie
  wieder, ist es ohne neues Speichern wieder an, auch wenn jemand das
  Board inzwischen gespeichert hat, siehe „Schalter ohne Freischaltung“.

## Freischaltung

Ein bezahltes Modul kauft man bei Discord; Discord nimmt Zahlung und
Steuern, der Bot prüft nur Entitlements. Wann ein Modul auf einem Server
freigeschaltet ist, steht in
[0020](../entscheidungen/0020-bezahlte-module.md):

| Art | wie | Module |
|---|---|---|
| Einmalkauf | die Person kauft im Store und bindet den Kauf auf dem Board an diesen Server, mit der Aktion `<modul>Binden` | Managed Commands, 4,99 € |
| Abo „Log“ | ein Abo des Servers im Store | das Speichern des Logs, 4,99 € im Monat; kommt mit dem Modul Log |
| Abo „Alles“ | ein Abo des Servers im Store | jedes bezahlte Modul, 19,99 € im Monat, solange es läuft |

- Die IDs der SKUs sind Konfiguration in `.env`, nie im Code, siehe
  [Einrichtung und Betrieb](../benutzung/einrichtung.md), „Bezahlte
  Module“. Fehlt eine, ist ihr Angebot aus: Ohne SKU eines Einmalkaufs
  kann man ihn weder kaufen noch binden. Gesperrt ist das Modul dann nur,
  wenn auch kein Abo es enthält; „Alles“ schaltet es trotzdem frei. Davon
  hängt der eigene Server mit seinem Test-Entitlement ab.
- Ein gebundener Kauf bleibt, auch wenn der Bot den Server verlässt.

### Kauf binden

`POST /api/server/{id}/seiten/module/<modul>Binden`, ohne Body. Der Bot
sucht den ältesten Kauf des Moduls, den die angemeldete Person noch nicht
gebunden hat, bindet ihn an diesen Server und antwortet mit `200` und
einem `Satz`, etwa „Managed Commands ist freigeschaltet.“. Danach baut die
Oberfläche die Tabs neu, weil die Seite `alleNeu` hat.

- Gebunden ist ein Kauf, wenn sein Entitlement in der Tabelle der
  Bindungen steht; ob Discord ihn als verbraucht führt, zählt nicht. Die
  Entitlement-ID ist dort eindeutig, so bindet ein Kauf nie zwei Server,
  auch nicht bei zwei Anfragen zugleich.
- Erst eintragen, dann bei Discord verbrauchen. Scheitert das Verbrauchen,
  antwortet der Bot trotzdem `200`: Das Modul ist freigeschaltet. Er holt
  das Verbrauchen vor jedem Binden nach und beim Abgleich unten. Wie
  genau, steht in [0020](../entscheidungen/0020-bezahlte-module.md),
  „Entscheidung“.
- Bindet eine zweite Anfrage zugleich denselben Kauf, nimmt der Bot den
  nächsten freien. Bindet sie zugleich einen anderen Kauf an denselben
  Server, gilt `schon_freigeschaltet`.

| Status | Code | Wann |
|---|---|---|
| `400` | `kein_kauf` | die Person hat keinen Kauf des Moduls, der noch nicht gebunden ist |
| `400` | `schon_freigeschaltet` | das Modul ist auf dem Server schon freigeschaltet; der Kauf bleibt frei |
| `503` | `nicht_erreichbar` | Discord liefert die Käufe der Person oder die Abos des Servers nicht: `5xx` nach den Wiederholungen von `@discordjs/rest` oder Abbruch. Auf ein `429` wartet der Bot und fragt dann noch einmal |

Die Aktion zählt zur Grenze für Bausteine, siehe
[API des Dashboards](api.md), „Grenzen je Sitzung“. Ein Kauf gilt für
einen Server und lässt sich nicht verschieben; das sagt die Hilfe der
Aktion.

Die Bindung endet, wenn Discord das Entitlement löscht, etwa bei einer
Erstattung (`ENTITLEMENT_DELETE`). War der Bot dabei nicht verbunden, holt
er es nach: Nach jeder neuen Sitzung eines Shards, beim Start und nach
einem neuen Identify ohne Resume (`ShardReady`), gleicht `gleicheAb` die
Bindungen der Server dieses Shards ab. Nach einem Resume spielt Discord
die Ereignisse selbst nach.

- Je gebundener SKU liest der Bot alle Käufe mit `exclude_deleted=false`,
  in Seiten zu 100 mit `after`. Gelöscht ist ein Kauf nur, wenn Discord ihn
  dort mit `deleted: true` führt
  ([List Entitlements](https://docs.discord.com/developers/resources/entitlement#list-entitlements),
  `exclude_deleted`); dann fällt die Bindung. Get Entitlement sagt nicht,
  wie es einen gelöschten Kauf liefert.
- Fehlt ein Kauf in der Liste oder scheitert eine Seite, bleibt die
  Bindung. Was die Seiten davor mit `deleted: true` belegt haben, gilt.
  So verliert niemand ein bezahltes Modul wegen eines `5xx`.
- Ist ein gebundener Kauf noch nicht verbraucht, verbraucht der Bot ihn im
  selben Durchgang.
- Das Log nennt nur Zahlen: `Käufe abgeglichen: n Bindungen, n gelöscht,
  n nachverbraucht, n offen.`

## Bausteine

Für jedes Modul mit Schalter, in der Reihenfolge der Tabs:

| ID | Art | Was |
|---|---|---|
| `hinweis` | `hinweis`, `info` | einmal oben: Ein Modul, das aus ist, tut nichts; seine Einstellungen bleiben |
| `<modul>` | `schalter` | `titel` ist der Name des Moduls, `hilfe` sagt, was es tut; bei einem bezahlten dazu Preis und Art, etwa „4,99 € einmalig für einen Server, oder im Abo „Alles““. Bezahlt und nicht freigeschaltet: `gesperrt` mit Code `nicht_freigeschaltet` |
| `<modul>Kaufen` | `link` | nur bezahlt und nicht freigeschaltet, direkt unter dem Schalter: in den Store von Discord |
| `<modul>Binden` | `aktion` | nur für einen Einmalkauf, solange das Modul nicht freigeschaltet ist: „Kauf hier freischalten“, siehe „Kauf binden“ |

Die Seite hat `alleNeu: true`, siehe [Baukasten](baukasten.md), „Typen“:
Nach dem Speichern und nach einer Aktion holt die Oberfläche alle Seiten
neu und baut die Tabs neu. Ein Modul, das angeht, zeigt so gleich seine Tabs, eins, das ausgeht,
verliert sie.

Der Link zeigt auf die SKU im Store,
`https://discord.com/application-directory/<Anwendung>/store/<SKU>`, oder
auf den Store der Anwendung, ohne `/<SKU>`
([Managing SKUs](https://docs.discord.com/developers/monetization/managing-skus)).
Die IDs setzt der Bot ein; hier stehen sie nicht.

## Typen

```ts
// Ein Feld je Modul mit Schalter, etwa
// { begruessung: true, sprachraeume: true, strafen: false }.
type Module = Record<string, boolean>;
```

`Module` ist der Wert der Seite. Für ein bezahltes Modul, das nicht
freigeschaltet ist, ist der
Wert `false`, auch wenn er gespeichert `true` ist; der Schalter ist dann
gesperrt und aus.

## Speichern

`PUT /api/server/{id}/seiten/module` nimmt `Module`. Der Bot prüft in dieser
Reihenfolge und antwortet beim ersten Fehler mit `400`, dem Code und dem
Feld:

| Feld | Regel | Code |
|---|---|---|
| alle | ein Objekt, je Modul mit Schalter ein `boolean`; ausgenommen ein bezahltes Modul, das nicht freigeschaltet ist, siehe unten; andere Felder zählen nicht | `ungueltig` |

- Die Antwort ist `{ wert, meldung }`; `meldung` sagt, wie viele Module an
  sind.
- Ein Modul, das ausgeht, hört sofort auf, siehe „Ein Modul ist aus“.

### Schalter ohne Freischaltung

Für ein bezahltes Modul, das nicht freigeschaltet ist, behält der Bot den
gespeicherten Schalter, egal was im Body steht. Die Oberfläche darf das
Feld weglassen; das ist kein Fehler, wie beim Wert eines `bild`. Wer das
Board in der Lücke speichert, etwa nachdem ein Abo endete und bevor ein
neues läuft, ändert am bezahlten Modul also nichts. Kommt die
Freischaltung wieder, ist es so an oder aus wie vorher.

## Ein Modul ist aus

| Wo | was dann gilt |
|---|---|
| `GET …/seiten` | ohne die Seiten des Moduls |
| jede andere Route einer seiner Seiten | `409` `modul_aus`, nach Sitzung, Grenzen und Rechten; siehe [Baukasten](baukasten.md), „Routen“ |
| Ereignisse von Discord | das Modul tut nichts: keine Begrüssung, keine neuen Sprachräume |
| Aufräumen | geht weiter: Ein bestehender Sprachraum wird gelöscht, wenn er leer ist, auch beim Abgleich nach dem Start |
| seine Slash-Befehle | antworten nur für den Nutzer, dass das Modul auf dem Server aus ist |
| seine Knöpfe und Formulare | ebenso |
| seine Einstellungen | bleiben gespeichert, auch Bilder; verlässt der Bot den Server, gehen sie wie bisher |

Slash-Befehle sind global registriert und stehen darum auch dort, wo ihr
Modul aus ist.

## Im Bot

Das Board lebt in `bot/src/brett/`, einer eigenen Schicht neben `api/`:

- Es importiert `kern/` und `discord/`, nie `module/*`.
- `bot/src/index.ts` gibt ihm die Liste der Module. Es liest nur, was ein
  Modul im Vertrag `Modul` über seinen Schalter anmeldet: ID, Name, was es
  tut, ob bezahlt.
- Es hält den Zustand je Server in einer eigenen Tabelle und meldet seine
  Seite als `Bereich` an, als letzten.
- `haengeAn` in `bot/src/discord/modul.ts` und die API bekommen von
  `index.ts` eine Funktion, die sagt, ob ein Modul auf einem Server an ist.
  So importiert keine Schicht das Board.

Gebaut ist das in `Brett` in `bot/src/brett/brett.ts`:

- Die Tabelle `module_an` hält je Server und Modul den Schalter, siehe
  [Datenbank](../bot/datenbank.md), „Tabellen“. Ohne Zeile gilt der
  Standard des Moduls. `Aufraeumen` löscht sie mit den Tabellen der Module.
- `Brett#istAn` liest die Schalter eines Servers aus einem Cache, den
  `speichere` und `vergiss` leeren, siehe [Cache](../bot/cache.md).
- Ein Modul meldet `schalter` im Vertrag `Modul` an und, was es auch aus
  tun muss, in `aufraeumen` seines `DiscordModul`, siehe
  [Struktur von Bot und Oberfläche](../entwicklung/struktur.md), „Ein Modul“.
- Ob ein bezahltes Modul freigeschaltet ist, wohin der Link zeigt und wie
  ein Kauf gebunden wird, gibt `bot/src/index.ts` dem Board mit
  `freigeschaltet`, `kaufen`, `bindbar` und `binde`. Die Regeln dahinter
  stehen in `Freischaltung` in `bot/src/brett/freischaltung.ts`, nach
  [0020](../entscheidungen/0020-bezahlte-module.md): Bindungen aus der
  Tabelle `bindungen` und laufende Abos von Discord, je Server in einem
  Cache, die Abos 10 min; ein Abo zählt bis zu `ends_at`, auch im Cache.
- Welches Modul zu welcher SKU gehört, steht nur in `bot/src/index.ts`:
  `strafen` zu `SKU_MANAGED_COMMANDS`, „Alles“ zu jedem bezahlten Modul,
  „Log“ zu `log`. `Freischaltung` kennt kein Modul, nur diese Zuordnung.
- Mit Discord spricht sie nur über `Kaeufe` aus
  `bot/src/discord/kaeufe.ts`. `ENTITLEMENT_CREATE`, `ENTITLEMENT_UPDATE`
  und `ENTITLEMENT_DELETE` leeren den Server im Cache der Abos;
  `ENTITLEMENT_DELETE` beendet dazu eine Bindung.
- Die Tabelle `bindungen` löscht `Aufraeumen` nicht, wenn der Bot einen
  Server verlässt.
- Noch hat kein Modul `bezahlt`; Managed Commands kommt mit
  `managed-commands-backend`.
