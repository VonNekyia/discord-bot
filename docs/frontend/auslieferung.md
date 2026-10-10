---
title: Auslieferung der Oberfläche
description: Welche Dateien aus web/ ausgeliefert werden, mit welchen Headern und CSP, wie man lokal baut und anschaut.
code:
  - web/serve.mjs
  - web/_headers
  - web/package.json
  - web/tsconfig.json
---

# Auslieferung der Oberfläche

Die Oberfläche ist statisch: `web/index.html`, `web/site.css`, die Bilder
und das Skript, das `tsc` aus `web/src/` nach `web/dist/` baut. Es gibt
keinen Bundler, siehe Entscheidung
[0004](../entscheidungen/0004-frontend-ohne-bundler.md). Jede Antwort trägt
die Header aus `web/_headers`.

## Lokal

```bash
cd web
npm ci
npm run build
npm run serve
```

`npm run serve` startet `serve.mjs` auf `http://127.0.0.1:4173/`. Es
liefert nur Dateien unter `web/` mit den Endungen `.html`, `.css`, `.js`,
`.png` und `.ico`, nichts aus `node_modules/`, sonst 404. Es ist für lokal
und die CI, nicht für Produktion.

## Header

`web/_headers` hat eine Zeile `Name: Wert` je Header, `#` beginnt einen
Kommentar. Wer die Oberfläche in Produktion ausliefert, liest dieselbe
Datei.

| Header | Wert |
|---|---|
| `Content-Security-Policy` | alles nur von `'self'`, kein `unsafe-inline`, `object-src 'none'` |
| `Permissions-Policy` | Kamera, Ort, Mikrofon, Zahlung, USB aus |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `SAMEORIGIN` |
| `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy` | `same-origin` |

Darum: kein `style="…"`, kein Skript im HTML, keine Schriften oder Bilder
von anderen Hosts. Braucht die Oberfläche später Avatare von Discord oder
eine API, kommen genau diese Hosts in `img-src` oder `connect-src`, in
derselben PR wie der Code.
