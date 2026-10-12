---
name: befehl-hinzufuegen
description: Fügt dem Bot einen Slash-Befehl hinzu oder ändert einen, mit Test und Doku. Nutzen, wenn der Backend-Developer einen Befehl, seine Optionen, Rechte oder Intents ändert.
---

# Befehl hinzufügen

## Ablauf

1. **Seiten lesen:** [Befehle](../../docs/benutzung/befehle.md),
   [Intents](../../docs/bot/intents.md),
   [Datenschutz](../../docs/bot/datenschutz.md).
2. **Befehl eintragen** in `befehle` in `bot/src/module/befehle/befehle.ts`:
   ein `Befehl` aus `bot/src/discord/befehle.ts` mit `name` klein,
   `beschreibung` auf Deutsch und `ausfuehren(aufruf)`. `ausfuehren`
   antwortet innerhalb von 3 s mit `aufruf.antworte`. Das Modul importiert
   kein discord.js: Braucht der Befehl mehr von Discord, etwa Optionen,
   den Server oder länger als 3 s (`warte`), bekommen `Befehl` oder
   `Aufruf` dafür einen eigenen Typ in `bot/src/discord/befehle.ts`.
3. **Rechte:** Braucht der Befehl Rechte des Nutzers, bekommt `Befehl`
   ein Feld dafür, und `registriere` setzt es mit
   `setDefaultMemberPermissions`. Braucht der Bot Rechte oder einen
   Intent, kommt beides mit Grund in die Doku (`AGENTS.md`, Regel 24).
4. **Daten:** Speichert der Befehl etwas über Nutzer, vorher eine Zeile in
   „Was der Bot speichert“ auf der Datenschutzseite. Nichts davon ins Log.
5. **Test** in `bot/src/module/befehle/befehle.test.ts`: die Antwort mit
   `aufruf`, ohne Discord. Der Test fällt, wenn der Befehl fehlt. Was neu
   in die Discord-Schicht kommt, prüft `bot/src/discord/befehle.test.ts`:
   der Aufruf wie von Discord mit `ruft` gegen `mockDiscord`, 429 und 5xx
   der REST-API mit `mockApi`.
6. **Doku:** eine Zeile in der Tabelle auf der Seite Befehle; Skill
   `doku-pflegen`.
7. **Prüfen:** `npm run lint` und `npm test` in `bot/`,
   `bash .github/pruefe-doku.sh` in der Wurzel.
8. **Ausprobieren** nur mit dem Test-Bot auf dem Test-Server, siehe
   [Einrichtung und Betrieb](../../docs/benutzung/einrichtung.md).

## Prüfliste

- [ ] Befehl in `befehle`, Zeile in der Tabelle der Befehle.
- [ ] Rechte und Intents begründet.
- [ ] Gespeicherte Daten auf der Datenschutzseite; nichts davon im Log.
- [ ] Test, der ohne den Befehl fällt; Neues in der Discord-Schicht mit
  Fehlern der API getestet.
- [ ] Nur mit dem Test-Bot ausprobiert.
