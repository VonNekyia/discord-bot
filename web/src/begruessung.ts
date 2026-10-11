// Ein Formular für Beitritt oder Abschied: Kanal, Text, Banner, Bild und
// Vorschau, gespeichert über die API. Prüft vor dem Senden dieselben Regeln
// wie das Backend. Siehe docs/frontend/dashboard.md, „Formular“.
import { api, ApiFehler, type Art, type Einstellung, type Kanal } from './api.js';
import { grenzeBanner, grenzeText, laengeImBanner, laengeImText } from './platzhalter.js';
import { meldung, satz, type Satz } from './texte.js';

const artName: Record<Art, string> = { beitritt: 'Beitritt', abschied: 'Abschied' };
const bildTypen = ['image/png', 'image/jpeg', 'image/webp'];
const bildGroesse = 4 * 1024 * 1024;
type Feld = 'kanal' | 'text' | 'bild' | 'bannerText';

// Prüft ein Bild vor dem Hochladen wie das Backend; gibt den Code des ersten Fehlers zurück.
// Siehe docs/schnittstelle/api.md, „Bild“.
async function bildPruefen(datei: File): Promise<string | null> {
  if (!bildTypen.includes(datei.type)) return 'bildtyp';
  if (datei.size > bildGroesse) return 'bild_zu_gross';
  let bild: ImageBitmap;
  try {
    bild = await createImageBitmap(datei);
  } catch {
    return 'bild_unlesbar';
  }
  const { width, height } = bild;
  bild.close();
  if (width > 4096 || height > 4096) return 'bild_zu_gross';
  if (width < 200 || height < 200) return 'bild_zu_klein';
  return null;
}

const rest = (laenge: number, grenze: number) =>
  laenge <= grenze
    ? `Noch ${grenze - laenge} von ${grenze} Zeichen frei, mit den längsten Namen gerechnet.`
    : `${laenge - grenze} Zeichen zu viel, mit den längsten Namen gerechnet.`;

export class Begruessung {
  private readonly form: HTMLFormElement;
  private readonly an: HTMLInputElement;
  private readonly kanal: HTMLSelectElement;
  private readonly text: HTMLTextAreaElement;
  private readonly banner: HTMLInputElement;
  private readonly bannerHinweis: HTMLElement;
  private readonly bild: HTMLInputElement;
  private readonly entfernen: HTMLButtonElement;
  private readonly bannerText: HTMLInputElement;
  private readonly speichernKnopf: HTMLButtonElement;
  private readonly meldungen: HTMLElement;
  private readonly vorschau: HTMLElement;
  private readonly vorschauBild: HTMLImageElement;
  private readonly keinBild: HTMLElement;
  private einstellung: Einstellung;

  constructor(
    panel: HTMLElement,
    private readonly serverId: string,
    private readonly art: Art,
    private readonly kanaele: Kanal[],
    einstellung: Einstellung,
    private readonly abgemeldet: () => void,
  ) {
    this.einstellung = einstellung;
    const vorlage = document.getElementById('vorlage-begruessung') as HTMLTemplateElement;
    const inhalt = vorlage.content.cloneNode(true) as DocumentFragment;
    // IDs je Art, damit Labels, Hilfe und Fehler zu ihrem Feld finden.
    for (const element of inhalt.querySelectorAll<HTMLElement>('[data-id]')) element.id = `${art}-${element.dataset.id}`;
    for (const label of inhalt.querySelectorAll<HTMLLabelElement>('[data-fuer]')) label.htmlFor = `${art}-${label.dataset.fuer}`;
    for (const feld of inhalt.querySelectorAll<HTMLElement>('[data-feld]')) {
      const name = feld.dataset.feld;
      const ids = [...feld.querySelectorAll<HTMLElement>('.help, .error')].map((span, i) => (span.id = `${art}-${name}-${i}`));
      feld.querySelector('[data-id]')?.setAttribute('aria-describedby', ids.join(' '));
    }
    const finde = <T extends Element>(wahl: string) => inhalt.querySelector(wahl) as T;
    this.form = finde('form');
    this.an = finde('[name="an"]');
    this.kanal = finde('[name="kanal"]');
    this.text = finde('[name="text"]');
    this.banner = finde('[name="banner"]');
    this.bannerHinweis = finde('[data-banner-hinweis]');
    this.bild = finde('[name="bild"]');
    this.entfernen = finde('[data-bild-entfernen]');
    this.bannerText = finde('[name="bannerText"]');
    this.speichernKnopf = finde('button[type="submit"]');
    this.meldungen = finde('[data-meldung]');
    this.vorschau = finde('[data-vorschau]');
    this.vorschauBild = finde('[data-vorschau] img');
    this.keinBild = finde('[data-kein-bild]');
    this.bannerHinweis.id = `${art}-banner-hinweis`;
    this.banner.setAttribute('aria-describedby', this.bannerHinweis.id);
    finde<HTMLElement>('[data-art-name]').textContent = artName[art];
    panel.replaceChildren(inhalt);

    // Die Liste kommt sortiert; Kanäle einer Kategorie stehen in einer optgroup.
    // Siehe docs/schnittstelle/api.md, „Typen“.
    let gruppe: HTMLOptGroupElement | null = null;
    for (const k of kanaele) {
      const option = new Option(`#${k.name}`, k.id);
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
    this.fuellen();

    this.kanal.addEventListener('change', () => {
      this.feldFehler('kanal', null);
      this.bannerPruefen();
    });
    this.text.addEventListener('input', () => this.restZeigen());
    this.bannerText.addEventListener('input', () => this.restZeigen());
    this.bild.addEventListener('change', () => void this.hochladen());
    this.entfernen.addEventListener('click', () => void this.bildEntfernen());
    this.form.addEventListener('submit', (ereignis) => {
      ereignis.preventDefault();
      void this.speichern();
    });
    this.vorschauBild.addEventListener('error', () => this.keinBildZeigen('Keine Vorschau.', 'Die Vorschau liess sich nicht laden. Speicher noch einmal, dann versucht kitty es neu.'));
  }

  // Setzt die Felder auf den gespeicherten Stand.
  private fuellen(): void {
    const e = this.einstellung;
    this.an.checked = e.an;
    const bekannt = e.kanal !== null && this.kanaele.some((k) => k.id === e.kanal);
    this.kanal.value = bekannt ? (e.kanal ?? '') : '';
    // Eine gespeicherte ID, die es nicht mehr gibt, kommt so, wie sie ist.
    // Siehe docs/schnittstelle/api.md, „Typen“.
    this.feldFehler('kanal', e.kanal !== null && !bekannt ? satz('kanal_unbekannt') : null);
    this.text.value = e.text;
    this.banner.checked = e.banner;
    this.bannerText.value = e.bannerText;
    this.restZeigen();
    this.bannerPruefen();
    this.vorschauZeigen();
  }

  private restZeigen(): void {
    this.rest('text', rest(laengeImText(this.text.value), grenzeText));
    this.rest('bannerText', rest(laengeImBanner(this.bannerText.value), grenzeBanner));
  }

  private rest(feld: Feld, text: string): void {
    const ziel = this.form.querySelector<HTMLElement>(`[data-feld="${feld}"] [data-rest]`);
    if (ziel) ziel.textContent = text;
  }

  // Das Banner geht nur mit Bild und einem Kanal, in dem kitty Dateien anhängen darf.
  private bannerPruefen(): void {
    const kanal = this.kanaele.find((k) => k.id === this.kanal.value);
    let grund = '';
    if (!this.einstellung.bild) grund = 'Für das Banner lädst du zuerst unten ein Bild hoch.';
    else if (!kanal) grund = 'Für das Banner wählst du zuerst einen Kanal.';
    else if (!kanal.banner) grund = 'In diesem Kanal darf kitty keine Dateien anhängen. Gib kitty dort das Recht „Dateien anhängen“ oder wähl einen anderen Kanal.';
    this.banner.disabled = grund !== '';
    if (grund) this.banner.checked = false;
    this.bannerHinweis.textContent = grund;
    this.bannerHinweis.hidden = grund === '';
  }

  private vorschauZeigen(): void {
    this.entfernen.hidden = !this.einstellung.bild;
    if (!this.einstellung.bild) {
      this.keinBildZeigen('Noch kein Bild.', 'Lade ein Bild hoch, dann siehst du hier das Banner.');
      return;
    }
    this.vorschauBild.src = api.vorschau(this.serverId, this.art);
    this.vorschau.hidden = false;
    this.keinBild.hidden = true;
  }

  private keinBildZeigen(titel: string, text: string): void {
    this.vorschau.hidden = true;
    this.keinBild.hidden = false;
    (this.keinBild.querySelector('h4') as HTMLElement).textContent = titel;
    (this.keinBild.querySelector('p') as HTMLElement).textContent = text;
  }

  private feldFehler(feld: Feld, inhalt: Satz | null): void {
    const element = this.form.querySelector(`[data-feld="${feld}"]`) as HTMLElement;
    const fehler = element.querySelector('.error') as HTMLElement;
    element.classList.toggle('field-error', inhalt !== null);
    element.querySelector('[data-id]')?.setAttribute('aria-invalid', String(inhalt !== null));
    fehler.textContent = inhalt ? `${inhalt.titel} ${inhalt.text}` : '';
    fehler.hidden = inhalt === null;
  }

  // Zeigt einen Fehler am Feld, sonst unter dem Knopf; bei 401 zeigt die Seite die Anmeldung.
  private fehlerZeigen(fehler: unknown, feld: Feld | null): void {
    if (fehler instanceof ApiFehler && fehler.status === 401) return this.abgemeldet();
    const ziel = fehler instanceof ApiFehler && ['kanal', 'text', 'bannerText'].includes(fehler.feld ?? '') ? (fehler.feld as Feld) : feld;
    if (ziel) this.feldFehler(ziel, satz(fehler));
    else meldung(this.meldungen, 'error', satz(fehler));
  }

  private async hochladen(): Promise<void> {
    const datei = this.bild.files?.[0];
    if (!datei) return;
    this.feldFehler('bild', null);
    this.bild.disabled = true;
    try {
      const code = await bildPruefen(datei);
      if (code) return this.feldFehler('bild', satz(code));
      await api.bildHochladen(this.serverId, this.art, datei);
      this.einstellung.bild = true;
      this.bannerPruefen();
      this.vorschauZeigen();
    } catch (fehler) {
      this.fehlerZeigen(fehler, 'bild');
    } finally {
      this.bild.disabled = false;
      this.bild.value = '';
    }
  }

  private async bildEntfernen(): Promise<void> {
    this.feldFehler('bild', null);
    this.entfernen.disabled = true;
    try {
      await api.bildLoeschen(this.serverId, this.art);
      // Das Backend setzt banner dabei auf false. Siehe docs/schnittstelle/api.md, „Bild“.
      this.einstellung.bild = false;
      this.einstellung.banner = false;
      this.bannerPruefen();
      this.vorschauZeigen();
    } catch (fehler) {
      this.fehlerZeigen(fehler, 'bild');
    } finally {
      this.entfernen.disabled = false;
    }
  }

  // Prüft in der Reihenfolge des Backends; zeigt alle Fehler an ihren Feldern.
  // Siehe docs/schnittstelle/api.md, „Einstellung speichern“.
  private pruefen(daten: Omit<Einstellung, 'bild'>): boolean {
    let gut = true;
    const laengeText = laengeImText(daten.text);
    if (laengeText > grenzeText) {
      this.feldFehler('text', { titel: 'Der Text ist zu lang.', text: rest(laengeText, grenzeText) });
      gut = false;
    }
    const laengeBanner = laengeImBanner(daten.bannerText);
    if (laengeBanner > grenzeBanner) {
      this.feldFehler('bannerText', { titel: 'Der Text ist zu lang.', text: rest(laengeBanner, grenzeBanner) });
      gut = false;
    }
    if (daten.an && daten.kanal === null) {
      this.feldFehler('kanal', satz('an_ohne_kanal'));
      gut = false;
    }
    if (gut && daten.an && daten.text.trim() === '' && !daten.banner) {
      meldung(this.meldungen, 'error', satz('an_ohne_inhalt'));
      gut = false;
    }
    return gut;
  }

  private async speichern(): Promise<void> {
    for (const feld of ['text', 'bannerText'] as const) this.feldFehler(feld, null);
    if (this.kanal.value !== '') this.feldFehler('kanal', null);
    this.meldungen.replaceChildren();
    const daten = {
      an: this.an.checked,
      kanal: this.kanal.value || null,
      text: this.text.value,
      banner: this.banner.checked,
      bannerText: this.bannerText.value,
    };
    if (!this.pruefen(daten)) return;
    this.speichernKnopf.disabled = true;
    try {
      this.einstellung = await api.speichern(this.serverId, this.art, daten);
      this.feldFehler('kanal', null);
      const kanal = this.kanaele.find((k) => k.id === this.einstellung.kanal);
      meldung(this.meldungen, 'ok', {
        titel: 'Gespeichert.',
        text: this.einstellung.an && kanal ? `kitty schreibt ab jetzt in #${kanal.name}.` : 'Solange „Aktiv“ aus ist, schickt kitty nichts.',
      });
      this.vorschauZeigen();
    } catch (fehler) {
      this.fehlerZeigen(fehler, null);
    } finally {
      this.speichernKnopf.disabled = false;
    }
  }
}
