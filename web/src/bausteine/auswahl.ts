// Eine Auswahl: Select aus dem Guide („Select“). Optionen mit derselben
// Gruppe stehen in einer optgroup; gesperrte nennen ihren Grund. Ein
// gespeicherter Wert, den es nicht mehr gibt, steht als Fehler am Feld, bis
// man wählt. Siehe docs/schnittstelle/baukasten.md, „Bausteine“.
import type { Auswahl, Option } from '../api/klient.js';
import { Feld } from '../kern/feld.js';
import type { Bauer } from '../kern/teil.js';

export const auswahl: Bauer<Auswahl> = (b, u, start) => {
  const select = document.createElement('select');
  const feld = new Feld(u, b.id, b.titel, select, b.hilfe);
  select.add(new Option(b.leer, ''));
  const optionen = new Map<string, Option>();
  const elemente = new Map<string, HTMLOptionElement>();
  // Die Liste kommt sortiert; die Oberfläche sortiert nicht um.
  let gruppe: HTMLOptGroupElement | null = null;
  let gruppeId: string | null = null;
  for (const o of b.optionen) {
    const element = new Option(o.name, o.id);
    optionen.set(o.id, o);
    elemente.set(o.id, element);
    if (!o.gruppe) {
      select.add(element);
      gruppe = null;
      gruppeId = null;
      continue;
    }
    if (!gruppe || gruppeId !== o.gruppe.id) {
      gruppe = document.createElement('optgroup');
      gruppe.label = o.gruppe.name;
      gruppeId = o.gruppe.id;
      select.append(gruppe);
    }
    gruppe.append(element);
  }

  // Auch eine gesperrte Option lässt sich setzen; der Fehler dazu kommt aus der Prüfung.
  const gespeichert = typeof start === 'string' ? start : null;
  let veraltet = gespeichert !== null && !optionen.has(gespeichert);
  select.value = veraltet ? '' : (gespeichert ?? '');

  select.addEventListener('change', () => {
    veraltet = false;
    feld.fehler(null);
    u.geaendert();
  });

  const option = () => optionen.get(select.value);

  // Gesperrte Optionen und, mit `einmalig`, die in anderen Einträgen gewählten.
  const aktualisiere = (): boolean => {
    const { vorher, nachher } = u.geschwister(b.id);
    const andere = new Set(b.einmalig ? [...vorher, ...nachher] : []);
    for (const o of b.optionen) {
      const element = elemente.get(o.id);
      if (!element) continue;
      const woanders = o.id !== select.value && andere.has(o.id);
      element.disabled = o.gesperrt !== null || woanders;
      element.textContent = o.gesperrt ? `${o.name} – ${o.gesperrt.grund}` : woanders ? `${o.name} – schon gewählt` : o.name;
    }
    return false;
  };

  // In der Reihenfolge des Bots. Siehe docs/schnittstelle/baukasten.md, „Prüfen in der Oberfläche“.
  const pruefe = (alles: boolean): boolean => {
    const o = option();
    let code: string | null = null;
    if (veraltet) code = b.unbekannt;
    else if (!o) code = alles && b.pflicht ? b.pflicht : null;
    else if (o.gesperrt) code = o.gesperrt.code;
    // Doppelt ist erst der spätere Eintrag, wie beim Bot.
    else if (b.einmalig && u.geschwister(b.id).vorher.includes(o.id)) code = b.einmalig;
    feld.fehler(code === null ? null : u.satz(code));
    return code === null;
  };

  const melde = (code: string): boolean => {
    feld.fehler(u.satz(code));
    return true;
  };

  return { elemente: [feld.element], wert: () => select.value || null, option, aktualisiere, pruefe, melde };
};
