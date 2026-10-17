---
title: "0020: Bezahlte Module über Discord"
description: Warum bezahlte Module über Discord laufen, Module ohne laufende Kosten als Einmalkauf, den die Person im Dashboard an einen Server bindet, Module mit laufenden Kosten als Abo je Server in zwei Stufen; wie der Bot Entitlements prüft und cacht; nicht Durable, keine Abos je Person, keine eigene Zahlung.
status: gilt
date: 2026-10-17
issues: []
code:
  - bot/src/kern/modul.ts
  - bot/src/index.ts
---

# 0020: Bezahlte Module über Discord

## Anlass

Der Maintainer will bezahlte Module und hat die Preise festgelegt:

- Module ohne laufende Kosten für uns kosten einmalig 4,99 € und bleiben
  freigeschaltet. Managed Commands gehört dazu.
- Module mit laufenden Kosten sind ein Abo. Das Log in unsere Datenbank
  kostet 4,99 € im Monat.
- Ein Abo für 19,99 € im Monat schaltet alle Module frei, solange es läuft.

Das Board aus [0019](0019-module-an-und-aus.md) kennt dafür nur
„freigeschaltet, ja oder nein“. Diese Entscheidung sagt, wann das gilt.

## Entscheidung

Bezahlt wird nur über Discord. Discord nimmt Zahlung und Steuern; der Bot
prüft nur Entitlements
([Monetization](https://docs.discord.com/developers/monetization/overview)).

**Einmalkauf, je Modul.** Eine SKU der Art Consumable je Modul ohne
laufende Kosten. Ein Einmalkauf gehört der Person, die kauft, nicht einem
Server: „Discord creates an Entitlement for the purchasing user and that
specific SKU“
([Implementing One-Time Purchases](https://docs.discord.com/developers/monetization/implementing-one-time-purchases)).
Darum bindet die Person den Kauf selbst an einen Server:

1. Sie kauft im Store von Discord.
2. Im Dashboard, auf dem Board des Servers, löst sie die Aktion
   `<modul>Binden` aus, siehe [Board der Module](../schnittstelle/module.md),
   „Freischaltung“.
3. Der Bot liest die Käufe dieser Person
   (`GET /applications/{id}/entitlements` mit `user_id` und `sku_ids`,
   [List Entitlements](https://docs.discord.com/developers/resources/entitlement#list-entitlements)).
   Die Liste enthält auch verbrauchte: „The entitlement will have
   `consumed: true` when using List Entitlements“
   ([Consume an Entitlement](https://docs.discord.com/developers/resources/entitlement#consume-an-entitlement)).
   Gelöschte fehlen, `exclude_deleted` ist ohne Angabe `true`.
4. **Frei** ist ein Kauf, dessen Entitlement nicht in der Tabelle der
   Bindungen steht, egal ob Discord ihn als `consumed` führt. „Gebunden“
   heisst: steht in der Tabelle. Dort ist die Entitlement-ID eindeutig, und
   je Server und SKU gibt es höchstens eine Bindung.
5. **Erst eintragen, dann verbrauchen.** Der Bot trägt den ersten freien
   Kauf für den Server ein. Scheitert das an der eindeutigen
   Entitlement-ID, weil eine zweite Anfrage zugleich denselben Kauf
   bindet, nimmt er den nächsten freien; gibt es keinen, `kein_kauf`. So
   schaltet ein Kauf nie zwei Server frei.
6. Danach verbraucht er das Entitlement
   ([Consume an Entitlement](https://docs.discord.com/developers/resources/entitlement#consume-an-entitlement)),
   damit die Person dasselbe Modul für einen weiteren Server kaufen kann,
   und vermerkt das an der Bindung. Scheitert das Verbrauchen, bleibt die
   Bindung, und das Modul ist freigeschaltet. Der Bot verbraucht beim
   nächsten Binden und beim Start nach, was gebunden, aber nicht vermerkt
   ist. So geht kein Kauf verloren: Ohne Eintrag wird nichts verbraucht.
7. Die Bindung gilt, bis Discord das Entitlement löscht, etwa bei einer
   Rückerstattung (`ENTITLEMENT_DELETE`). Ein Kauf lässt sich nicht auf
   einen anderen Server verschieben.

**Abo, je Server.** SKUs der Art Subscription mit dem Flag
`GUILD_SUBSCRIPTION`; eine Person kauft für einen Server, und es gilt für
alle dort ([SKU Flags](https://docs.discord.com/developers/resources/sku#sku-object-sku-flags)).
Zwei Stufen derselben Anwendung: „Log“ (4,99 € im Monat) und „Alles“
(19,99 € im Monat). Ein Server hat höchstens eine Stufe zugleich: Beim
Wechsel endet die alte sofort
([Implementing App Subscriptions](https://docs.discord.com/developers/monetization/implementing-app-subscriptions)).
„Alles“ schaltet jedes bezahlte Modul frei, solange es läuft, auch
Einmalkäufe wie Managed Commands.

**Freigeschaltet** ist ein Modul auf einem Server, wenn eins davon gilt:

- eine Bindung eines Einmalkaufs dieses Moduls an den Server;
- ein laufendes Abo des Servers, das das Modul enthält: ein Entitlement
  mit `guild_id` des Servers, nicht `deleted`, `ends_at` leer oder in der
  Zukunft
  ([Entitlement Object](https://docs.discord.com/developers/resources/entitlement#entitlement-object)).

**Prüfen:**

- Bindungen liest der Bot aus PostgreSQL. Verlässt er einen Server,
  bleiben sie; sonst wäre ein Kauf verloren, wenn er neu eingeladen wird.
- Abos fragt er je Server mit `guild_id`, `sku_ids` und `exclude_ended`
  und hält die Antwort 10 min im Cache. Jedes `ENTITLEMENT_CREATE`,
  `ENTITLEMENT_UPDATE` und `ENTITLEMENT_DELETE` mit `guild_id` leert den
  Server darin. Diese Ereignisse kommen ohne Intent: Was die Liste der
  Intents nicht nennt, „will always be sent to your app“
  ([List of Intents](https://docs.discord.com/developers/events/gateway#list-of-intents)).
- So fragt nicht jedes Ereignis eines bezahlten Moduls Discord, und
  unterschiedlich lange Antworten vertauschen keine Ereignisse.
- In einer Interaktion stehen die Entitlements des Nutzers schon im
  Payload (`entitlements`,
  [Interaction Object](https://docs.discord.com/developers/interactions/receiving-and-responding#interaction-object-interaction-structure)),
  bei einem Abo des Servers auch das des Servers. Die Befehle nutzen
  trotzdem dieselbe Prüfung wie alles andere, damit eine Bindung zählt.

**Konfiguration:** Die IDs der SKUs stehen in `.env`, nie im Code:
`SKU_MANAGED_COMMANDS`, `SKU_ABO_LOG`, `SKU_ABO_ALLES`. Fehlt eine, ist ihr
Angebot aus; ein Modul ohne Freischaltung ist überall aus und gesperrt.

**Eigener Server:** Er bekommt die bezahlten Module über ein
Test-Entitlement der SKU „Alles“ für den Server (`owner_type` 1), ohne
Ausnahme im Code. Discord „will act as though that user or guild has
entitlement to your premium offering“, und ein Test-Entitlement hat kein
`ends_at`, „as it's valid in perpetuity“
([Create Test Entitlement](https://docs.discord.com/developers/resources/entitlement#create-test-entitlement)).
Für den Bot ist es damit ein laufendes Abo. Wie das Team es anlegt, steht
in [Einrichtung und Betrieb](../benutzung/einrichtung.md), „Eigener
Server“.

**Store:** Der Link zum Kaufen zeigt auf die SKU,
`https://discord.com/application-directory/<Anwendung>/store/<SKU>`
([Managing SKUs](https://docs.discord.com/developers/monetization/managing-skus)).

**Preis und Art** stehen als Text am Schalter des Moduls, etwa „4,99 €
einmalig für einen Server“. Discord liefert den Preis einer SKU nicht über
die API.

## Verworfene Alternativen

- **Durable statt Consumable.** Ein Durable lässt sich nicht verbrauchen;
  ein Consumable dagegen „Users cannot repurchase this SKU until you
  consume the entitlement“. Wer zwei Server freischalten will, braucht
  also ein Consumable, das der Bot beim Binden verbraucht.
- **Einmalkauf ohne Bindung, gilt auf jedem Server der Person.** Dann
  schaltete ein Kauf jeden Server frei, den die Person verwaltet.
- **Erst verbrauchen, dann eintragen.** Scheitert das Eintragen danach,
  ist der Kauf verbraucht, aber an keinen Server gebunden, und die Person
  hat bezahlt, ohne etwas zu bekommen.
- **„Frei“ nach `consumed` von Discord.** Zwei Anfragen zugleich sähen
  denselben unverbrauchten Kauf und bänden ihn beide; ein Kauf, dessen
  Verbrauchen scheiterte, sähe frei aus, obwohl er gebunden ist.
- **Eine Ausnahme im Code für den eigenen Server**, etwa eine Server-ID
  in `.env`. Mehr Code und eine Stelle, die niemand testet; das
  Test-Entitlement nimmt denselben Weg wie ein echtes Abo.
- **Einen Kauf verschieben.** Der Maintainer will das nicht: Ein Kauf gilt
  fest für den Server, an den er gebunden ist.
- **Bindung per Slash-Befehl auf dem Server.** Der Befehl gehörte keinem
  Modul; das Board ist schon der Ort, an dem man Module freischaltet.
- **Abos je Person (`USER_SUBSCRIPTION`).** Eine Anwendung bietet
  entweder Abos je Person oder je Server an, nicht beides
  ([Managing SKUs](https://docs.discord.com/developers/monetization/managing-skus)).
  Das Log gehört einem Server, nicht einer Person.
- **Eine eigene Zahlung**, etwa über einen Zahlungsdienst. Steuern,
  Rechnungen und Rückerstattungen lägen bei uns.
- **Den Preis über die API lesen.** Das Objekt einer SKU hat keinen Preis
  ([SKU Object](https://docs.discord.com/developers/resources/sku#sku-object)).

## Folgen

- Eine Tabelle für Bindungen, die `Aufraeumen` nicht löscht, wenn der Bot
  einen Server verlässt.
- Der Preis steht zweimal: an der SKU und als Text am Modul. Wer ihn
  ändert, ändert beide.
- Je Server höchstens eine Anfrage an Discord je 10 min für Abos, dazu
  eine je Aktion `<modul>Binden`.
- Ob eine Anwendung Consumables und Abos je Server zugleich anbieten kann,
  sagt die Doku von Discord nicht. Das prüft der Maintainer im Developer
  Portal, bevor `managed-commands-backend` gemergt wird.
- Kein Code für den eigenen Server: Wer das Test-Entitlement löscht,
  nimmt ihm die bezahlten Module wie ein endendes Abo.
