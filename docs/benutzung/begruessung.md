---
title: Begrüssung bei Beitritt und Abschied
description: Was der Bot schickt, wenn jemand einem Server beitritt oder ihn verlässt; Platzhalter, Banner aus einem eigenen Bild, Standardwerte, Rechte und Intent.
code:
  - bot/src/index.ts
---

# Begrüssung bei Beitritt und Abschied

Tritt jemand einem Server bei oder verlässt ihn, schickt der Bot eine
Nachricht in den Kanal, den das Team des Servers im Dashboard wählt: einen
Text mit Platzhaltern, ein Banner aus einem eigenen Bild, oder beides.
Beitritt und Abschied werden getrennt eingestellt. Dafür braucht der Bot den
privilegierten Intent `GuildMembers`. Eingestellt wird über die
[API des Dashboards](../schnittstelle/api.md).

## Platzhalter

| Platzhalter | wird zu | längster Wert im Text | längster Wert im Banner |
|---|---|---|---|
| `{nutzer}` | Erwähnung des Mitglieds; im Banner `@` und Anzeigename | 23 Zeichen | 33 Zeichen |
| `{name}` | Anzeigename auf dem Server; im Text Markdown maskiert | 64 Zeichen | 32 Zeichen |
| `{server}` | Name des Servers; im Text Markdown maskiert | 200 Zeichen | 100 Zeichen |
| `{anzahl}` | Mitglieder nach dem Beitritt oder Abschied, als Ziffern | 10 Zeichen | 10 Zeichen |

- Zeichen zählen wie in [API des Dashboards](../schnittstelle/api.md),
  „Einstellung speichern“.
- Anzeigename und Servername sind höchstens 32 und 100 Zeichen lang; das
  Maskieren im Text setzt vor ein Zeichen höchstens einen `\`, darum dort
  das Doppelte. Belege: [Users](https://docs.discord.com/developers/resources/user),
  [Guild](https://docs.discord.com/developers/resources/guild).
- Andere Wörter in geschweiften Klammern bleiben, wie sie sind. Gross- und
  Kleinschreibung zählt.
- Beim Beitritt pingt nur die Erwähnung des neuen Mitglieds. Die Nachricht
  erlaubt nur diese eine Erwähnung (`allowed_mentions` mit genau dieser ID);
  `@everyone`, `@here` und Rollen pingen nie, auch wenn sie im Text stehen.
  Beim Abschied pingt nichts. Beleg:
  [Allowed Mentions](https://docs.discord.com/developers/resources/message#allowed-mentions-object).

## Banner

Das Banner ist ein PNG mit 1100 × 440 px, das der Bot bei jedem Ereignis
neu zeichnet:

- Hintergrund: das hochgeladene Bild, auf die Fläche skaliert und mittig
  beschnitten.
- Darüber ein dunkler Schleier, damit die Schrift lesbar bleibt.
- In der Mitte der Avatar des Mitglieds, rund, 200 px, mit hellem Rand.
  Lädt er nicht, der Standard-Avatar von Discord.
- Darunter `bannerText` mit Platzhaltern, in einer Zeile. Die Schrift wird
  von 64 px bis 32 px kleiner, bis der Text passt; sonst endet er mit „…“.
- Dateiname `beitritt.png` oder `abschied.png`.

Die Schrift liegt als Datei im Repository, weil auf einem Server oft keine
Schrift installiert ist. Sie steht unter der SIL Open Font License 1.1, ihr
Lizenztext liegt daneben; das hat der Maintainer so entschieden (Regel 27).
Welche es wird, legt das Backend mit dem Banner fest.

## Standardwerte

Ohne gespeicherte Einstellung gilt:

| Feld | Beitritt | Abschied |
|---|---|---|
| `an` | `false` | `false` |
| `kanal` | `null` | `null` |
| `text` | `Willkommen auf {server}, {nutzer}!` | `{name} hat den Server verlassen.` |
| `banner` | `false` | `false` |
| `bannerText` | `Willkommen, {name}!` | `Tschüss, {name}!` |

## Rechte und Intent

| Was | Wofür |
|---|---|
| Intent `GuildMembers`, privilegiert | Discord schickt `GUILD_MEMBER_ADD` und `GUILD_MEMBER_REMOVE` nur damit |
| „Kanal ansehen“ im gewählten Kanal | den Kanal finden |
| „Nachrichten senden“ im gewählten Kanal | die Nachricht |
| „Dateien anhängen“ im gewählten Kanal | das Banner |

Belege: [List of Intents](https://docs.discord.com/developers/events/gateway#list-of-intents),
[Privileged Intents](https://docs.discord.com/developers/events/gateway#privileged-intents),
[Permissions](https://docs.discord.com/developers/topics/permissions).

Der Intent muss im Developer Portal an sein, bevor ein Bot startet, der ihn
anfordert. Sonst schliesst Discord die Verbindung mit 4014, siehe
[Wiederanlauf](../bot/wiederanlauf.md). Ab 100 Servern muss Discord ihn
nach der Verifizierung des Bots freigeben.

## Wenn etwas fehlt

- Ist die Begrüssung aus, fehlt der Kanal oder fehlen dem Bot dort Rechte,
  schickt er nichts. Ins Log kommt eine Zeile ohne IDs und Namen.
- Scheitert das Banner, geht nur der Text. Ist der Text leer, geht nichts.
- Verlässt der Bot einen Server, löscht er dessen Einstellungen und Bilder.

## Was noch fehlt

- Eine Bremse, wenn in kurzer Zeit viele beitreten.
