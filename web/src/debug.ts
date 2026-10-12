// Die Debug-Ansicht: Anfragen des Bots an Discord, Rate-Limits, ungültige
// Anfragen und eigene Grenzen. Keine Seite des Baukastens, sondern eine feste
// Ansicht im Rahmen des Dashboards, nur mit `Ich.debug`.
// Siehe docs/frontend/dashboard.md, „Debug“.
import { api, ApiFehler, type Debug, type DebugRoute } from './api/klient.js';
import { meldung, satz } from './kern/texte.js';

// Höchstens so oft, und nur solange die Seite sichtbar ist.
// Siehe docs/schnittstelle/debug.md, „Neu laden“.
const abstand = 10_000;

const grenzen: Record<string, string> = {
  bremse: 'Bremse der Begrüssung',
  sitzung: 'Anfragen je Sitzung',
  bausteine: 'Anfragen auf Bausteine je Sitzung',
  testnachricht: 'Testnachrichten je Server',
};

const zahl = new Intl.NumberFormat('de-DE');
const uhrzeit = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

function finde(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`#${id} fehlt in dashboard/index.html`);
  return element;
}

// Eine Dauer in Sekunden, so grob, wie man sie liest.
function dauer(sekunden: number): string {
  const s = Math.max(0, Math.floor(sekunden));
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  if (s < 86_400) return `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min`;
  return `${Math.floor(s / 86_400)} d ${Math.floor((s % 86_400) / 3600)} h`;
}

function code(text: string): HTMLElement {
  const element = document.createElement('code');
  element.textContent = text;
  return element;
}

function zeile(...zellen: (string | HTMLElement)[]): HTMLTableRowElement {
  const tr = document.createElement('tr');
  for (const inhalt of zellen) {
    const td = document.createElement('td');
    td.append(inhalt);
    tr.append(td);
  }
  return tr;
}

// Zeiten gegen `jetzt` aus der Antwort, nicht gegen die Uhr des Browsers;
// die Header gelten zu `zuletzt`. Siehe docs/schnittstelle/debug.md, „Typen“.
function routenZeile(r: DebugRoute, jetzt: number): HTMLTableRowElement {
  const vergangen = (jetzt - Date.parse(r.zuletzt)) / 1000;
  const uebrig = r.remaining !== null && r.limit !== null ? `${zahl.format(r.remaining)} von ${zahl.format(r.limit)}` : '–';
  const reset = r.resetAfter === null ? '–' : `${Math.ceil(Math.max(0, r.resetAfter - vergangen))} s`;
  return zeile(r.methode, code(r.route), zahl.format(r.anfragen), zahl.format(r.rateLimits), uebrig, reset, `vor ${dauer(vergangen)}`);
}

export interface DebugAnsicht {
  // Die Ansicht ist zu sehen: laden und neu laden.
  zeige(): void;
  // Die Ansicht ist weg: nicht mehr laden.
  verlasse(): void;
}

// `abgelaufen` zeigt die Anmeldung, wenn die Anfrage 401 gibt.
export function debugAnsicht(abgelaufen: () => void): DebugAnsicht {
  const meldungen = finde('debug-meldung');
  const laden = finde('debug-laden');
  const inhalt = finde('debug-inhalt');
  const fortschritt = finde('debug-fortschritt');
  const balken = finde('debug-balken');
  const warnung = finde('debug-warnung');
  const routen = finde('debug-routen');
  const routenRahmen = finde('debug-routen-rahmen');
  const keineRoute = finde('debug-keine-route');

  let aktiv = false;
  let laeuft = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Frühester Zeitpunkt der nächsten Anfrage, in ms.
  let naechste = 0;

  const melde = (art: 'warn' | 'error', fehler: unknown, text = satz(fehler)) => {
    meldung(meldungen, art, text);
    meldungen.hidden = false;
    laden.hidden = true;
  };

  const zeigeDaten = (d: Debug) => {
    const jetzt = Date.parse(d.jetzt);
    finde('debug-stand').textContent =
      `Stand ${uhrzeit.format(jetzt)}, ${d.shards.length === 1 ? 'Shard' : 'Shards'} ${d.shards.join(', ')}. ` +
      'Lädt alle 10 Sekunden neu, solange die Seite offen ist.';
    finde('debug-anfragen').textContent = zahl.format(d.routen.reduce((summe, r) => summe + r.anfragen, 0));
    finde('debug-429').textContent = zahl.format(d.rateLimits.anzahl);
    finde('debug-seit').textContent = dauer((jetzt - Date.parse(d.seit)) / 1000);

    // Die Breite setzt das Skript über das CSSOM, nur hier; ein style im HTML
    // verbietet die CSP. Siehe docs/frontend/design.md, „Vom Orchestrator festgelegt“.
    const { letzte10min, warnung: schwelle, grenze } = d.ungueltig;
    balken.style.width = `${Math.min(100, (letzte10min / Math.max(1, grenze)) * 100)}%`;
    fortschritt.setAttribute('aria-valuenow', String(letzte10min));
    fortschritt.setAttribute('aria-valuemax', String(grenze));
    finde('debug-ungueltig').textContent = `${zahl.format(letzte10min)} in 10 Minuten`;
    finde('debug-grenze').textContent = `Grenze ${zahl.format(grenze)}`;
    warnung.hidden = letzte10min < schwelle;
    if (!warnung.hidden) {
      meldung(warnung, 'warn', {
        titel: 'Viele ungültige Anfragen.',
        text: `Ab ${zahl.format(grenze)} in 10 Minuten sperrt Cloudflare die IP des Bots. Such im Log nach der Ursache.`,
      });
    }

    routen.replaceChildren(...d.routen.map((r) => routenZeile(r, jetzt)));
    routenRahmen.hidden = d.routen.length === 0;
    keineRoute.hidden = d.routen.length > 0;
    const { user, global, shared } = d.rateLimits.scope;
    finde('debug-scope').replaceChildren(
      zeile(code('user'), zahl.format(user)),
      zeile(code('global'), zahl.format(global)),
      zeile(code('shared'), zahl.format(shared)),
      zeile('davon mit „global: true“', zahl.format(d.rateLimits.global)),
    );
    finde('debug-eigene').replaceChildren(...d.eigene.map((e) => zeile(grenzen[e.name] ?? code(e.name), zahl.format(e.gegriffen))));

    meldungen.hidden = true;
    laden.hidden = true;
    inhalt.hidden = false;
  };

  const plane = (ms: number) => {
    clearTimeout(timer);
    naechste = Date.now() + ms;
    timer = setTimeout(() => void lade(), ms);
  };

  // Nach 429 erst nach `Retry-After`, nach 403 gar nicht mehr.
  // Siehe docs/schnittstelle/debug.md, „Neu laden“.
  const lade = async (): Promise<void> => {
    timer = undefined;
    if (!aktiv || laeuft || document.visibilityState !== 'visible') return;
    laeuft = true;
    try {
      const d = await api.debug();
      if (!aktiv) return;
      zeigeDaten(d);
      plane(abstand);
    } catch (fehler) {
      if (!aktiv) return;
      if (fehler instanceof ApiFehler && fehler.status === 401) {
        aktiv = false;
        abgelaufen();
      } else if (fehler instanceof ApiFehler && fehler.status === 403) {
        aktiv = false;
        inhalt.hidden = true;
        melde('error', fehler, satz('kein_recht_debug'));
      } else if (fehler instanceof ApiFehler && fehler.status === 429) {
        melde('warn', fehler);
        plane((fehler.warten ?? 60) * 1000);
      } else {
        melde('error', fehler);
        plane(abstand);
      }
    } finally {
      laeuft = false;
    }
  };

  // Wird die Seite wieder sichtbar, lädt sie nach, sobald es wieder geht.
  document.addEventListener('visibilitychange', () => {
    if (!aktiv || laeuft || timer !== undefined || document.visibilityState !== 'visible') return;
    plane(Math.max(0, naechste - Date.now()));
  });

  return {
    zeige: () => {
      if (aktiv) return;
      aktiv = true;
      meldungen.hidden = true;
      if (inhalt.hidden) laden.hidden = false;
      plane(Math.max(0, naechste - Date.now()));
    },
    verlasse: () => {
      aktiv = false;
      clearTimeout(timer);
      timer = undefined;
    },
  };
}
