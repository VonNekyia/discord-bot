# discord-bot

<p>
  <a href="https://github.com/VonNekyia/discord-bot/actions/workflows/backend.yml"><img alt="Backend" src="https://github.com/VonNekyia/discord-bot/actions/workflows/backend.yml/badge.svg"></a>
  <a href="https://github.com/VonNekyia/discord-bot/actions/workflows/frontend.yml"><img alt="Frontend" src="https://github.com/VonNekyia/discord-bot/actions/workflows/frontend.yml/badge.svg"></a>
  <a href="https://github.com/VonNekyia/discord-bot/actions/workflows/doku.yml"><img alt="Doku" src="https://github.com/VonNekyia/discord-bot/actions/workflows/doku.yml/badge.svg"></a>
  <img alt="Bot mit discord.js" src="https://img.shields.io/badge/Bot-discord.js-5865f2">
  <img alt="Oberfläche in TypeScript" src="https://img.shields.io/badge/Oberfl%C3%A4che-TypeScript-3178c6">
</p>

**kitty** ist ein Discord-Bot: ein Bot in TypeScript mit discord.js und
eine Weboberfläche in TypeScript im Design der Website von Terranova.

## Stand

Grundgerüst. Der Bot meldet sich an und kennt `/ping`. Die Oberfläche
ist eine Startseite im Design der Website; was sie einmal mehr kann,
ist offen.

## Schnellstart

```bash
cd bot
cp .env.example .env
npm ci
npm test
npm start
```

`DISCORD_BOT_TOKEN` in `bot/.env` eintragen, siehe
[Einrichtung und Betrieb](docs/benutzung/einrichtung.md).

Die Oberfläche:

```bash
cd web
npm ci
npm run build
npm run serve
```

## Mitarbeiten

Die Regeln stehen in [`AGENTS.md`](AGENTS.md), das Wissen in
[`docs/`](docs/index.md). Jede Änderung kommt als PR auf `main`, auf dem
neuesten Stand von `main`.

## Lizenz

Apache-2.0, siehe [`LICENSE`](LICENSE) und [`NOTICE`](NOTICE). Kontakt:
contact@mcterranova.com
