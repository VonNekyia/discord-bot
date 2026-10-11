// Der Tab „Sprachräume“: der Schalter und die Liste der Erzeuger, gespeichert
// über die API. Prüft vor dem Senden dieselben Regeln wie das Backend.
// Siehe docs/frontend/dashboard.md, „Sprachräume“.
import { api, ApiFehler, type Erzeuger, type SprachDaten, type Sprachraeume } from './api.js';
import { grenzeRaumname, laengeImRaumnamen } from './platzhalter.js';
import { meldung, satz, type Satz } from './texte.js';

// Siehe docs/schnittstelle/sprachraeume.md, „Sprachräume einstellen“.
const hoechstens = 10;
const neu: Erzeuger = { kanal: '', kategorie: null, name: '{name}s Raum', limit: 0 };
type Feld = 'kanal' | 'kategorie' | 'name' | 'limit';

// Ein Erzeuger in der Liste, als Karte mit seinen Feldern.
class Eintrag {
  readonly element: HTMLElement;
  readonly kopf: HTMLElement;
  readonly kanal: HTMLSelectElement;
  readonly kategorie: HTMLSelectElement;
  readonly ort: HTMLElement;
  readonly name: HTMLInputElement;
  readonly limit: HTMLInputElement;
  readonly entfernen: HTMLButtonElement;
  // Gespeicherte IDs, die es nicht mehr gibt; der Fehler bleibt, bis man das Feld ändert.
  kanalVeraltet = false;
  kategorieVeraltet = false;

  constructor(nummer: number, daten: SprachDaten, wert: Erzeuger) {
    const vorlage = document.getElementById('vorlage-erzeuger') as HTMLTemplateElement;
    const inhalt = vorlage.content.cloneNode(true) as DocumentFragment;
    const praefix = `sr-${nummer}`;
    for (const element of inhalt.querySelectorAll<HTMLElement>('[data-id]')) element.id = `${praefix}-${element.dataset.id}`;
    for (const label of inhalt.querySelectorAll<HTMLLabelElement>('[data-fuer]')) label.htmlFor = `${praefix}-${label.dataset.fuer}`;
    for (const feld of inhalt.querySelectorAll<HTMLElement>('[data-feld]')) {
      const ids = [...feld.querySelectorAll<HTMLElement>('.help, .error')].map((span, i) => (span.id = `${praefix}-${feld.dataset.feld}-${i}`));
      feld.querySelector('[data-id]')?.setAttribute('aria-describedby', ids.join(' '));
    }
    const finde = <T extends Element>(wahl: string) => inhalt.querySelector(wahl) as T;
    this.element = finde('article');
    this.kopf = finde('[data-kopf]');
    this.kanal = finde('[name="kanal"]');
    this.kategorie = finde('[name="kategorie"]');
    this.ort = finde('[data-ort]');
    this.name = finde('[name="name"]');
    this.limit = finde('[name="limit"]');
    this.entfernen = finde('[data-entfernen]');

    // Sprachkanäle in der Reihenfolge der API, Kanäle einer Kategorie in einer optgroup.
    let gruppe: HTMLOptGroupElement | null = null;
    for (const k of daten.sprachkanaele) {
      const option = new Option(k.name, k.id);
      option.dataset.name = k.name;
      if (!k.kategorie) {
        this.kanal.add(option);
        continue;
      }
      if (gruppe?.dataset.id !== k.kategorie.id) {
        gruppe = document.createElement('optgroup');
        gruppe.label = k.kategorie.name;
        gruppe.dataset.id = k.kategorie.id;
        this.kanal.append(gruppe);
      }
      gruppe.append(option);
    }
    for (const k of daten.kategorien) {
      const option = new Option(k.bereit ? k.name : `${k.name} – kitty fehlt ein Recht`, k.id);
      option.disabled = !k.bereit;
      this.kategorie.add(option);
    }

    // Auch eine gesperrte Option lässt sich setzen; der Fehler dazu kommt aus der Prüfung.
    this.kanalVeraltet = wert.kanal !== '' && !daten.sprachkanaele.some((k) => k.id === wert.kanal);
    this.kanal.value = this.kanalVeraltet ? '' : wert.kanal;
    this.kategorieVeraltet = wert.kategorie !== null && !daten.kategorien.some((k) => k.id === wert.kategorie);
    this.kategorie.value = this.kategorieVeraltet ? '' : (wert.kategorie ?? '');
    this.name.value = wert.name;
    this.limit.value = String(wert.limit);
  }

  wert(): Erzeuger {
    return {
      kanal: this.kanal.value,
      kategorie: this.kategorie.value || null,
      name: this.name.value,
      limit: this.limit.value.trim() === '' ? Number.NaN : Number(this.limit.value),
    };
  }

  fehler(feld: Feld, inhalt: Satz | null): void {
    const element = this.element.querySelector(`[data-feld="${feld}"]`) as HTMLElement;
    const ziel = element.querySelector('.error') as HTMLElement;
    element.classList.toggle('field-error', inhalt !== null);
    element.querySelector('[data-id]')?.setAttribute('aria-invalid', String(inhalt !== null));
    ziel.textContent = inhalt ? `${inhalt.titel} ${inhalt.text}` : '';
    ziel.hidden = inhalt === null;
  }
}

export class SprachraeumeFormular {
  private readonly form: HTMLFormElement;
  private readonly an: HTMLInputElement;
  private readonly liste: HTMLElement;
  private readonly leer: HTMLElement;
  private readonly listeFehler: HTMLElement;
  private readonly hinzufuegen: HTMLButtonElement;
  private readonly voll: HTMLElement;
  private readonly speichernKnopf: HTMLButtonElement;
  private readonly meldungen: HTMLElement;
  private eintraege: Eintrag[] = [];
  private zaehler = 0;

  constructor(
    panel: HTMLElement,
    private readonly serverId: string,
    private readonly daten: SprachDaten,
    wert: Sprachraeume,
    private readonly abgemeldet: () => void,
  ) {
    const vorlage = document.getElementById('vorlage-sprachraeume') as HTMLTemplateElement;
    const inhalt = vorlage.content.cloneNode(true) as DocumentFragment;
    for (const element of inhalt.querySelectorAll<HTMLElement>('[data-id]')) element.id = `sr-${element.dataset.id}`;
    const finde = <T extends Element>(wahl: string) => inhalt.querySelector(wahl) as T;
    this.form = finde('form');
    this.an = finde('[name="an"]');
    this.liste = finde('[data-liste]');
    this.leer = finde('[data-leer]');
    this.listeFehler = finde('[data-liste-fehler]');
    this.hinzufuegen = finde('[data-hinzufuegen]');
    this.voll = finde('[data-voll]');
    this.speichernKnopf = finde('button[type="submit"]');
    this.meldungen = finde('[data-meldung]');
    // Ohne die Rechte auf dem Server geht kein Erzeuger.
    // Siehe docs/schnittstelle/sprachraeume.md, „Typen“.
    finde<HTMLElement>('[data-warnung]').hidden = daten.ohneKategorie.bereit;
    panel.replaceChildren(inhalt);

    this.an.checked = wert.an;
    for (const erzeuger of wert.erzeuger) this.anhaengen(erzeuger);
    this.aktualisieren();
    // Was gespeichert ist und nicht mehr geht, steht gleich am Feld.
    this.pruefen(false);

    this.hinzufuegen.addEventListener('click', () => {
      const eintrag = this.anhaengen(neu);
      this.aktualisieren();
      eintrag.kanal.focus();
    });
    this.form.addEventListener('submit', (ereignis) => {
      ereignis.preventDefault();
      void this.speichern();
    });
  }

  private anhaengen(wert: Erzeuger): Eintrag {
    const eintrag = new Eintrag(this.zaehler++, this.daten, wert);
    this.eintraege.push(eintrag);
    this.liste.append(eintrag.element);
    eintrag.kanal.addEventListener('change', () => {
      eintrag.kanalVeraltet = false;
      eintrag.fehler('kanal', null);
      eintrag.fehler('kategorie', null);
      this.aktualisieren();
    });
    eintrag.kategorie.addEventListener('change', () => {
      eintrag.kategorieVeraltet = false;
      eintrag.fehler('kategorie', null);
      this.aktualisieren();
    });
    eintrag.name.addEventListener('input', () => {
      eintrag.fehler('name', null);
      this.aktualisieren();
    });
    eintrag.limit.addEventListener('input', () => eintrag.fehler('limit', null));
    eintrag.entfernen.addEventListener('click', () => {
      this.eintraege = this.eintraege.filter((e) => e !== eintrag);
      eintrag.element.remove();
      this.listeFehler.hidden = true;
      this.aktualisieren();
      this.hinzufuegen.focus();
    });
    return eintrag;
  }

  // Ob kitty dort Räume anlegen darf, wohin ein Eintrag sie legt; null, solange kein Sprachkanal gewählt ist.
  private kategorieBereit(eintrag: Eintrag): boolean | null {
    const { kanal, kategorie } = eintrag.wert();
    if (kategorie !== null) return this.daten.kategorien.find((k) => k.id === kategorie)?.bereit ?? false;
    const sprachkanal = this.daten.sprachkanaele.find((k) => k.id === kanal);
    if (!sprachkanal) return null;
    if (!sprachkanal.kategorie) return this.daten.ohneKategorie.bereit;
    const id = sprachkanal.kategorie.id;
    return this.daten.kategorien.find((k) => k.id === id)?.bereit ?? false;
  }

  // Nummern, Orte, Zähler, gesperrte Optionen und der Knopf zum Hinzufügen.
  private aktualisieren(): void {
    const gewaehlt = this.eintraege.map((e) => e.kanal.value);
    for (const [i, eintrag] of this.eintraege.entries()) {
      const sprachkanal = this.daten.sprachkanaele.find((k) => k.id === eintrag.kanal.value);
      eintrag.kopf.textContent = sprachkanal ? `Erzeuger ${i + 1} · ${sprachkanal.name}` : `Erzeuger ${i + 1}`;
      for (const option of eintrag.kanal.querySelectorAll<HTMLOptionElement>('option[data-name]')) {
        const k = this.daten.sprachkanaele.find((x) => x.id === option.value);
        const woanders = option.value !== eintrag.kanal.value && gewaehlt.includes(option.value);
        option.disabled = !k?.bereit || woanders;
        option.textContent = !k?.bereit ? `${option.dataset.name} – kitty fehlt ein Recht` : woanders ? `${option.dataset.name} – schon gewählt` : (option.dataset.name ?? '');
      }
      const kategorie = this.daten.kategorien.find((k) => k.id === eintrag.kategorie.value);
      eintrag.ort.textContent = kategorie
        ? `Räume entstehen in „${kategorie.name}“.`
        : sprachkanal
          ? sprachkanal.kategorie
            ? `Räume entstehen in „${sprachkanal.kategorie.name}“, wie der Erzeuger.`
            : 'Räume entstehen ohne Kategorie, wie der Erzeuger.'
          : 'Räume entstehen in der Kategorie des Erzeugers.';
      const laenge = laengeImRaumnamen(eintrag.name.value);
      (eintrag.element.querySelector('[data-rest]') as HTMLElement).textContent =
        laenge <= grenzeRaumname
          ? `Noch ${grenzeRaumname - laenge} von ${grenzeRaumname} Zeichen frei, mit 32 Zeichen für {name} gerechnet.`
          : `${laenge - grenzeRaumname} Zeichen zu viel, mit 32 Zeichen für {name} gerechnet.`;
    }
    this.leer.hidden = this.eintraege.length > 0;
    this.hinzufuegen.disabled = this.eintraege.length >= hoechstens;
    this.voll.hidden = this.eintraege.length < hoechstens;
  }

  // Prüft in der Reihenfolge des Backends und zeigt je Feld den ersten Fehler.
  // Mit `alles` auch, was erst beim Speichern zählt: leere Felder und Aktiv ohne Erzeuger.
  // Siehe docs/schnittstelle/sprachraeume.md, „Sprachräume einstellen“.
  private pruefen(alles: boolean): boolean {
    let gut = true;
    const gesehen = new Set<string>();
    for (const eintrag of this.eintraege) {
      const wert = eintrag.wert();
      const sprachkanal = this.daten.sprachkanaele.find((k) => k.id === wert.kanal);
      const fehler: Partial<Record<Feld, Satz>> = {};
      if (eintrag.kanalVeraltet) fehler.kanal = satz('erzeuger_unbekannt');
      else if (!sprachkanal) {
        if (alles) fehler.kanal = satz('erzeuger_fehlt');
      } else if (!sprachkanal.bereit) fehler.kanal = satz('erzeuger_ohne_recht');
      else if (gesehen.has(wert.kanal)) fehler.kanal = satz('erzeuger_doppelt');
      if (sprachkanal) gesehen.add(wert.kanal);
      if (eintrag.kategorieVeraltet) fehler.kategorie = satz('kategorie_unbekannt');
      else if (this.kategorieBereit(eintrag) === false) fehler.kategorie = satz('kategorie_ohne_recht');
      const laenge = laengeImRaumnamen(wert.name);
      if (wert.name.includes('\0')) fehler.name = satz('steuerzeichen');
      else if (wert.name.trim() === '') fehler.name = satz('name_leer');
      else if (laenge > grenzeRaumname) fehler.name = { titel: 'Der Name ist zu lang.', text: `Kürz ihn um ${laenge - grenzeRaumname} Zeichen.` };
      if (!Number.isInteger(wert.limit) || wert.limit < 0 || wert.limit > 99) fehler.limit = satz('limit_ungueltig');
      for (const feld of ['kanal', 'kategorie', 'name', 'limit'] as const) {
        eintrag.fehler(feld, fehler[feld] ?? null);
        if (fehler[feld]) gut = false;
      }
    }
    if (alles && gut && this.an.checked && this.eintraege.length === 0) {
      meldung(this.meldungen, 'error', satz('an_ohne_erzeuger'));
      gut = false;
    }
    return gut;
  }

  // Ein Fehler mit `feld` `erzeuger.<i>.…` steht am Eintrag, wie er gesendet wurde.
  private fehlerZeigen(fehler: unknown, gesendet: Eintrag[]): void {
    if (fehler instanceof ApiFehler && fehler.status === 401) return this.abgemeldet();
    const pfad = fehler instanceof ApiFehler ? /^erzeuger\.(\d+)\.(kanal|kategorie|name|limit)$/.exec(fehler.feld ?? '') : null;
    const eintrag = pfad ? gesendet[Number(pfad[1])] : undefined;
    if (pfad && eintrag) {
      const feld = pfad[2] as Feld;
      // Die Oberfläche schickt immer Strings; ungueltig am Namen heisst darum NUL.
      eintrag.fehler(feld, satz(fehler instanceof ApiFehler && fehler.code === 'ungueltig' && feld === 'name' ? 'steuerzeichen' : fehler));
    } else if (fehler instanceof ApiFehler && fehler.feld === 'erzeuger') {
      const inhalt = satz(fehler);
      this.listeFehler.textContent = `${inhalt.titel} ${inhalt.text}`;
      this.listeFehler.hidden = false;
    } else {
      meldung(this.meldungen, 'error', satz(fehler));
    }
  }

  private async speichern(): Promise<void> {
    this.meldungen.replaceChildren();
    this.listeFehler.hidden = true;
    if (!this.pruefen(true)) return;
    const gesendet = [...this.eintraege];
    const wert: Sprachraeume = { an: this.an.checked, erzeuger: gesendet.map((e) => e.wert()) };
    this.speichernKnopf.disabled = true;
    try {
      const gespeichert = await api.sprachraeumeSpeichern(this.serverId, wert);
      const anzahl = gespeichert.erzeuger.length;
      meldung(this.meldungen, 'ok', {
        titel: 'Gespeichert.',
        text: gespeichert.an
          ? `Wer ${anzahl === 1 ? 'den Erzeuger' : `einen der ${anzahl} Erzeuger`} betritt, bekommt einen Raum.`
          : 'Solange „Aktiv“ aus ist, entstehen keine neuen Räume.',
      });
    } catch (fehler) {
      this.fehlerZeigen(fehler, gesendet);
    } finally {
      this.speichernKnopf.disabled = false;
    }
  }
}
