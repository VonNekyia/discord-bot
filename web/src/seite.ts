// Baut eine Seite des Baukastens: das Formular aus ihren Bausteinen, den
// Knopf „Speichern“, Meldungen und was daneben steht. Jede Art von Baustein
// liegt in src/bausteine/; diese Datei verbindet sie.
// Siehe docs/frontend/dashboard.md, „Eine Seite“.
import { api, ApiFehler, type Baustein, type Eintrag, type Seite, type Wert } from './api/klient.js';
import { aktion } from './bausteine/aktion.js';
import { auswahl } from './bausteine/auswahl.js';
import { bild } from './bausteine/bild.js';
import { hinweis } from './bausteine/hinweis.js';
import { liste } from './bausteine/liste.js';
import { schalter } from './bausteine/schalter.js';
import { text } from './bausteine/text.js';
import { vorschau } from './bausteine/vorschau.js';
import { zahl } from './bausteine/zahl.js';
import { meldung, satz } from './kern/texte.js';
import type { Geschwister, Teil, Umgebung } from './kern/teil.js';

// Eine Art, die diese Oberfläche nicht kennt, oder ein Baustein, der nicht zu seiner
// Beschreibung passt, steht als Warnung an seiner Stelle; src/api/klient.ts macht ihn dazu.
// Siehe docs/schnittstelle/baukasten.md, „Bausteine“.
function unbekannt(): Teil {
  const element = document.createElement('div');
  meldung(element, 'warn', { titel: 'Diesen Teil kann das Dashboard noch nicht zeigen.', text: 'Lade die Seite neu; hilft das nicht, sag dem Team Bescheid.' });
  return { elemente: [element] };
}

function baue(b: Baustein, u: Umgebung, start: Wert | undefined): Teil {
  switch (b.art) {
    case 'schalter':
      return schalter(b, u, start);
    case 'auswahl':
      return auswahl(b, u, start);
    case 'text':
      return text(b, u, start);
    case 'zahl':
      return zahl(b, u, start);
    case 'bild':
      return bild(b, u, start);
    case 'vorschau':
      return vorschau(b, u, start);
    case 'aktion':
      return aktion(b, u, start);
    case 'liste':
      return liste(b, u, start);
    case 'hinweis':
      return hinweis(b, u, start);
    case 'unbekannt':
      break;
  }
  return unbekannt();
}

const keine: Geschwister = { vorher: [], nachher: [] };

// Vergleicht ohne Rücksicht auf die Reihenfolge der Schlüssel; die Antwort
// des Bots muss sie nicht so ordnen wie das Formular.
const kanonisch = (wert: Eintrag): string =>
  JSON.stringify(wert, (_schluessel, w: unknown) =>
    w !== null && typeof w === 'object' && !Array.isArray(w) ? Object.fromEntries(Object.entries(w).toSorted(([a], [b]) => (a < b ? -1 : 1))) : w,
  );

// `abgemeldet` zeigt die Anmeldung, wenn eine Anfrage 401 gibt.
export function baueSeite(seite: Seite, server: string, abgemeldet: () => void): HTMLElement {
  const teile = new Map<string, Teil>();
  const form = document.createElement('form');
  form.className = 'form';
  form.noValidate = true;
  const knopf = document.createElement('button');
  knopf.className = 'button';
  knopf.type = 'submit';
  const erstes = document.createElement('span');
  erstes.textContent = 'Speichern';
  const zweites = document.createElement('strong');
  zweites.textContent = seite.titel;
  knopf.append(erstes, zweites);
  const meldungen = document.createElement('div');
  meldungen.setAttribute('role', 'status');

  // Der gespeicherte Stand, so wie das Formular ihn zeigt; ohne Bilder, die
  // ihre eigene Route haben.
  let basis: Eintrag | undefined;
  const mitWert = () => [...seite.bausteine, ...seite.daneben].filter((b) => b.art !== 'bild' && teile.get(b.id)?.wert !== undefined);
  const werte = (): Eintrag => {
    const eintrag: Eintrag = {};
    for (const b of mitWert()) {
      const wert = teile.get(b.id)?.wert?.();
      if (wert !== undefined) eintrag[b.id] = wert;
    }
    return eintrag;
  };
  // Dieselben Felder aus einer Antwort des Bots.
  const ausAntwort = (wert: Eintrag): Eintrag => {
    const eintrag: Eintrag = {};
    for (const b of mitWert()) if (b.id in wert) eintrag[b.id] = wert[b.id] ?? null;
    return eintrag;
  };
  const ungespeichert = () => basis !== undefined && kanonisch(werte()) !== kanonisch(basis);

  // Aktionen zuletzt, damit sie den Vergleich nach allen anderen sehen. Was
  // ein Baustein selbst ändert, etwa ein gesperrter Schalter, gilt als
  // gespeichert: Der Bot hält es ebenso.
  const geaendert = (neuLaden = false) => {
    for (const [id, teil] of teile) {
      if (teil.aktualisiere?.() && basis && teil.wert) basis[id] = teil.wert();
    }
    if (neuLaden) for (const teil of teile.values()) teil.ladeNeu?.();
  };

  const amFeld = (code: string, feld: string): boolean => {
    const [id, ...pfad] = feld.split('.');
    return (id !== undefined && teile.get(id)?.melde?.(code, pfad)) ?? false;
  };

  // Siehe docs/schnittstelle/baukasten.md, „Fehler am Feld“.
  const zeige = (fehler: unknown, ort: HTMLElement) => {
    if (fehler instanceof ApiFehler && fehler.status === 401) return abgemeldet();
    if (fehler instanceof ApiFehler && fehler.feld && amFeld(fehler.code, fehler.feld)) return;
    meldung(ort, 'error', satz(fehler, seite.saetze));
  };

  const pruefe = (alles: boolean): boolean => {
    let gut = true;
    for (const teil of teile.values()) if (teil.pruefe && !teil.pruefe(alles)) gut = false;
    return gut;
  };

  const ebene = (praefix: string, lokal: ReadonlyMap<string, Teil>, geschwister: (feld: string) => Geschwister): Umgebung => ({
    id: (name) => `${praefix}-${name}`,
    satz: (fehler) => satz(fehler, seite.saetze),
    wert: (feld) => lokal.get(feld)?.wert?.(),
    option: (feld) => lokal.get(feld)?.option?.(),
    geschwister,
    geaendert,
    baue,
    innen: (p, t, g) => ebene(`${praefix}-${p}`, t, g),
    hochladen: (b, datei) => api.hochladen(server, seite.id, b, datei),
    loeschen: (b) => api.loeschen(server, seite.id, b),
    ausloesen: (b) => api.ausloesen(server, seite.id, b),
    bild: (b) => api.bild(server, seite.id, b),
    zeige,
    pruefeNeu: () => void pruefe(false),
    ungespeichert,
  });
  const u = ebene(seite.id, teile, () => keine);

  const aktionen = seite.bausteine.filter((b) => b.art === 'aktion');
  for (const b of [...seite.bausteine.filter((x) => x.art !== 'aktion'), ...seite.daneben, ...aktionen]) {
    teile.set(b.id, baue(b, u, seite.wert[b.id]));
  }
  const elemente = (bausteine: Baustein[]) => bausteine.flatMap((b) => teile.get(b.id)?.elemente ?? []);
  form.append(...elemente(seite.bausteine.filter((b) => b.art !== 'aktion')), knopf, meldungen, ...elemente(aktionen));

  // Beim Laden: was schon gespeichert nicht geht, und der Fund des Bots. Geht
  // er an kein Feld, etwa an einen Schalter oder ohne `feld`, steht er als
  // Warnung unter „Speichern“. Siehe docs/schnittstelle/baukasten.md, „Fehler am Feld“.
  pruefe(false);
  const fund = seite.fund;
  if (fund && !(fund.feld !== undefined && amFeld(fund.code, fund.feld))) meldung(meldungen, 'warn', satz(fund.code, seite.saetze));
  geaendert(true);
  basis = werte();

  form.addEventListener('submit', (ereignis) => {
    ereignis.preventDefault();
    meldungen.replaceChildren();
    if (!pruefe(true)) return;
    for (const teil of teile.values()) teil.merke?.();
    const gesendet = werte();
    knopf.disabled = true;
    void (async () => {
      try {
        const antwort = await api.speichern(server, seite.id, gesendet);
        // Gespeichert ist, was der Bot zurückgibt, nicht das Gesendete.
        // Siehe docs/schnittstelle/baukasten.md, „Routen“.
        basis = ausAntwort(antwort.wert);
        meldung(meldungen, 'ok', antwort.meldung);
        geaendert(true);
      } catch (fehler) {
        zeige(fehler, meldungen);
      } finally {
        knopf.disabled = false;
      }
    })();
  });

  if (seite.daneben.length === 0) return form;
  const raster = document.createElement('div');
  raster.className = 'grid grid-2';
  const daneben = document.createElement('div');
  daneben.append(...elemente(seite.daneben));
  raster.append(form, daneben);
  return raster;
}
