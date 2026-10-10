---
name: befehl-hinzufuegen
description: Fügt dem Bot einen Slash-Befehl hinzu oder ändert einen, mit Test und Doku. Nutzen, wenn der Backend-Developer einen Befehl, seine Optionen, Rechte oder Intents ändert.
---

# Befehl hinzufügen

## Ablauf

1. **Seiten lesen:** [Befehle](../../docs/benutzung/befehle.md),
   [Intents](../../docs/bot/intents.md),
   [Datenschutz](../../docs/bot/datenschutz.md).
2. **Befehl eintragen** in `befehle` in `bot/src/befehle.ts`: `daten` mit
   `SlashCommandBuilder`, Name klein, Beschreibung auf Deutsch;
   `ausfuehren` antwortet innerhalb von 3 s mit `reply` oder ruft vorher
   `deferReply` auf.
3. **Rechte:** Braucht der Befehl Rechte des Nutzers, mit
   `setDefaultMemberPermissions`. Braucht der Bot Rechte oder einen
   Intent, kommt beides mit Grund in die Doku (`AGENTS.md`, Regel 24).
4. **Daten:** Speichert der Befehl etwas über Nutzer, vorher eine Zeile in
   „Was der Bot speichert“ auf der Datenschutzseite. Nichts davon ins Log.
5. **Test** in `bot/src/befehle.test.ts`: die Antwort mit `interaktion`;
   ruft der Befehl die REST-API auf, auch 429 und 5xx mit `mockApi`.
   Der Test fällt, wenn der Befehl fehlt.
6. **Doku:** eine Zeile in der Tabelle auf der Seite Befehle; Skill
   `doku-pflegen`.
7. **Prüfen:** `npm test` in `bot/`, `bash .github/pruefe-doku.sh` in der
   Wurzel.
8. **Ausprobieren** nur mit dem Test-Bot auf dem Test-Server, siehe
   [Einrichtung und Betrieb](../../docs/benutzung/einrichtung.md).

## Prüfliste

- [ ] Befehl in `befehle`, Zeile in der Tabelle der Befehle.
- [ ] Rechte und Intents begründet.
- [ ] Gespeicherte Daten auf der Datenschutzseite; nichts davon im Log.
- [ ] Test, der ohne den Befehl fällt; Fehler der API getestet.
- [ ] Nur mit dem Test-Bot ausprobiert.
