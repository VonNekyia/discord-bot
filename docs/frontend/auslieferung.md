---
title: Auslieferung der Oberfläche
description: Welche Dateien aus web/ ausgeliefert werden, mit welchen Headern und CSP, wie serve.mjs /api/ an den Bot weiterleitet, wie man lokal baut und anschaut.
code:
  - web/serve.mjs
  - web/_headers
  - web/package.json
  - web/tsconfig.json
---

# Auslieferung der Oberfläche

Die Oberfläche ist statisch: `web/index.html`, das
[Dashboard](dashboard.md) in `web/dashboard/index.html`, `web/site.css`,
die Bilder und das Skript, das `tsc` aus `web/src/` nach `web/dist/` baut.
Es gibt keinen Bundler, siehe Entscheidung
[0004](../entscheidungen/0004-frontend-ohne-bundler.md). Jede Datei der
Oberfläche trägt die Header aus `web/_headers`. Anfragen unter `/api/`
gehen an den Bot, unter demselben Origin.

## Lokal

```bash
cd web
npm ci
npm run build
npm run serve
```

`npm run serve` startet `serve.mjs` auf `http://127.0.0.1:4173/`. Es ist
für lokal und die CI, nicht für Produktion.

| Anfrage | Was `serve.mjs` tut |
|---|---|
| Pfad beginnt mit `/api/` | leitet weiter an `http://127.0.0.1:<API_PORT>`, Standard 4174, siehe [API des Dashboards](../schnittstelle/api.md), „Lokal“ |
| Datei unter `web/` mit `.html`, `.css`, `.js`, `.png` oder `.ico` | liefert sie mit den Headern aus `web/_headers`; ein Pfad mit `/` am Ende liefert dort `index.html` |
| alles andere, auch `node_modules/` | `404` |

Die Weiterleitung reicht Methode, Pfad mit Query, Header und Body weiter
und gibt Status, Header und Body des Bots unverändert zurück, auch
`Set-Cookie` und `Location`. Die Header aus `web/_headers` kommen nicht
dazu. Antwortet der Bot nicht, gibt `serve.mjs` `502` mit
`{ "code": "nicht_erreichbar" }`. `API_PORT` liest es aus der Umgebung,
wie der Bot, siehe [Anmeldung am Dashboard](../schnittstelle/anmeldung.md),
„Umgebung“.

Für das Dashboard läuft der Bot mit seiner API daneben. Geöffnet wird es
unter `DASHBOARD_URL`, lokal `http://localhost:4173/dashboard/`, nicht unter
`127.0.0.1`: Sonst fehlt nach der Rückkehr von Discord das Cookie der
Anmeldung.

## Header

`web/_headers` hat eine Zeile `Name: Wert` je Header, `#` beginnt einen
Kommentar. Wer die Oberfläche in Produktion ausliefert, liest dieselbe
Datei.

| Header | Wert |
|---|---|
| `Content-Security-Policy` | alles nur von `'self'`, kein `unsafe-inline`, `object-src 'none'`; Bilder dazu von `data:` und `https://cdn.discordapp.com` |
| `Permissions-Policy` | Kamera, Ort, Mikrofon, Zahlung, USB aus |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `SAMEORIGIN` |
| `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy` | `same-origin` |

Darum: kein `style="…"`, kein Skript im HTML, keine Schriften von anderen
Hosts. Ein anderer Host kommt nur in die CSP, wenn die Oberfläche ihn
braucht, in derselben PR wie der Code:

| Direktive | Host | wofür |
|---|---|---|
| `img-src` | `https://cdn.discordapp.com` | Avatar in der Leiste und Icons der Server im Dashboard; die API liefert sie als volle URL, siehe [API des Dashboards](../schnittstelle/api.md), „Typen“ |

Die API liegt unter demselben Origin, darum reicht `connect-src 'self'`.
Die Vorschau des Banners kommt von der API, darum reicht für sie
`img-src 'self'`.
