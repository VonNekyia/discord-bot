// Eine Liste: je Eintrag eine Karte aus dem Guide („Cards“) mit ihren
// Bausteinen, dazu Hinzufügen, Entfernen und der leere Zustand. Ein Fehler
// nennt den Eintrag, wie er gesendet wurde: `<liste>.<i>.<feld>`.
// Siehe docs/schnittstelle/baukasten.md, „Bausteine“.
import type { Eintrag, Liste, Wert } from '../api/klient.js';
import type { Bauer, Geschwister, Teil } from '../kern/teil.js';

type Karte = { element: HTMLElement; kopf: HTMLElement; teile: Map<string, Teil> };

export const liste: Bauer<Liste> = (b, u, start) => {
  const raster = document.createElement('div');
  raster.className = 'grid';
  const leer = document.createElement('div');
  leer.className = 'empty';
  const leerTitel = document.createElement('h4');
  leerTitel.textContent = b.leer.titel;
  const leerText = document.createElement('p');
  leerText.textContent = b.leer.text;
  leer.append(leerTitel, leerText);
  const fehler = document.createElement('span');
  fehler.className = 'error';
  fehler.hidden = true;
  const hinzufuegen = document.createElement('button');
  hinzufuegen.type = 'button';
  hinzufuegen.className = 'link-button';
  hinzufuegen.textContent = b.hinzufuegen;
  const voll = document.createElement('span');
  voll.className = 'help';
  voll.textContent = b.voll;

  let karten: Karte[] = [];
  let gesendet: Karte[] = [];
  let zaehler = 0;

  const werteVon = (k: Karte): Eintrag => {
    const eintrag: Eintrag = {};
    for (const [id, teil] of k.teile) if (teil.wert) eintrag[id] = teil.wert();
    return eintrag;
  };
  const geschwister = (k: Karte, feld: string): Geschwister => {
    const i = karten.indexOf(k);
    const werte = (auswahl: Karte[]) => auswahl.map((x) => x.teile.get(feld)?.wert?.()).filter((w): w is Wert => w !== undefined);
    return { vorher: werte(karten.slice(0, i)), nachher: werte(karten.slice(i + 1)) };
  };

  const anhaengen = (werte: Eintrag): Karte => {
    const element = document.createElement('article');
    element.className = 'card';
    const innen = document.createElement('div');
    innen.className = 'form';
    const kopf = document.createElement('p');
    kopf.className = 'kicker';
    const teile = new Map<string, Teil>();
    const karte: Karte = { element, kopf, teile };
    const umgebung = u.innen(`${b.id}-${zaehler++}`, teile, (feld) => geschwister(karte, feld));
    for (const baustein of b.bausteine) teile.set(baustein.id, u.baue(baustein, umgebung, werte[baustein.id]));
    const entfernen = document.createElement('button');
    entfernen.type = 'button';
    entfernen.className = 'link-button';
    entfernen.textContent = b.entfernen;
    entfernen.addEventListener('click', () => {
      karten = karten.filter((k) => k !== karte);
      element.remove();
      fehler.hidden = true;
      u.geaendert();
      hinzufuegen.focus();
    });
    innen.append(kopf, ...[...teile.values()].flatMap((t) => t.elemente), entfernen);
    element.append(innen);
    karten.push(karte);
    raster.append(element);
    return karte;
  };

  for (const eintrag of Array.isArray(start) ? start : []) anhaengen(eintrag);
  // Ein Fund beim Laden nennt den Eintrag, wie er gespeichert ist.
  gesendet = [...karten];

  hinzufuegen.addEventListener('click', () => {
    const karte = anhaengen(b.neu);
    u.geaendert();
    karte.element.querySelector<HTMLElement>('select, input, textarea')?.focus();
  });

  // Nummern, Köpfe, gesperrte Optionen, leerer Zustand und der Knopf.
  const aktualisiere = (): boolean => {
    for (const [i, k] of karten.entries()) {
      for (const teil of k.teile.values()) teil.aktualisiere?.();
      const name = b.kopf ? k.teile.get(b.kopf)?.option?.()?.name : undefined;
      k.kopf.textContent = name ? `${b.eintrag} ${i + 1} · ${name}` : `${b.eintrag} ${i + 1}`;
    }
    leer.hidden = karten.length > 0;
    hinzufuegen.disabled = karten.length >= b.hoechstens;
    voll.hidden = karten.length < b.hoechstens;
    return false;
  };

  // Alle Einträge auf einmal, je Feld der erste Fehler.
  const pruefe = (alles: boolean): boolean => {
    fehler.hidden = true;
    let gut = true;
    for (const k of karten) for (const teil of k.teile.values()) if (teil.pruefe && !teil.pruefe(alles)) gut = false;
    return gut;
  };

  const melde = (code: string, pfad: readonly string[]): boolean => {
    const [i, feld, ...rest] = pfad;
    if (i === undefined) {
      const satz = u.satz(code);
      fehler.textContent = `${satz.titel} ${satz.text}`;
      fehler.hidden = false;
      return true;
    }
    const karte = gesendet[Number(i)];
    if (!karte || !karten.includes(karte) || feld === undefined) return false;
    return karte.teile.get(feld)?.melde?.(code, rest) ?? false;
  };

  return {
    elemente: [raster, leer, fehler, hinzufuegen, voll],
    wert: () => karten.map(werteVon),
    merke: () => {
      gesendet = [...karten];
    },
    aktualisiere,
    pruefe,
    melde,
  };
};
