// Ein Feld aus dem Guide („Text fields and text area“, „Select“): Label,
// Eingabe, Hilfe und Fehler, verbunden über IDs und aria-describedby.
// Siehe docs/frontend/design.md, „Elemente“.
import type { Satz } from '../api/klient.js';
import type { Umgebung } from './teil.js';

// Setzt reinen Text; `{wort}` erscheint als Code. Kein HTML aus der API.
// Siehe docs/schnittstelle/baukasten.md, „Typen“.
export function schreibe(ziel: HTMLElement, text: string): void {
  ziel.replaceChildren();
  for (const [i, teil] of text.split(/(\{[a-zA-Z]+\})/).entries()) {
    if (i % 2 === 0) {
      if (teil) ziel.append(teil);
      continue;
    }
    const code = document.createElement('code');
    code.textContent = teil;
    ziel.append(code);
  }
}

export class Feld {
  readonly element = document.createElement('div');
  readonly hilfe = document.createElement('span');
  // Hinter der Hilfe, für was sich beim Tippen ändert.
  readonly zusatz = document.createElement('span');
  private readonly fehlerText = document.createElement('span');

  constructor(
    u: Umgebung,
    name: string,
    titel: string,
    private readonly eingabe: HTMLElement,
    hilfe?: string,
  ) {
    this.element.className = 'field';
    const label = document.createElement('label');
    label.textContent = titel;
    eingabe.id = u.id(name);
    label.htmlFor = eingabe.id;
    this.hilfe.className = 'help';
    this.hilfe.id = u.id(`${name}-hilfe`);
    if (hilfe) schreibe(this.hilfe, hilfe);
    this.hilfe.append(this.zusatz);
    this.fehlerText.className = 'error';
    this.fehlerText.id = u.id(`${name}-fehler`);
    this.fehlerText.hidden = true;
    eingabe.setAttribute('aria-describedby', `${this.hilfe.id} ${this.fehlerText.id}`);
    this.element.append(label, eingabe, this.hilfe, this.fehlerText);
    this.zeigeHilfe();
  }

  // Die Hilfe nur, wenn sie etwas sagt.
  zeigeHilfe(): void {
    this.hilfe.hidden = this.hilfe.textContent.trim() === '';
  }

  fehler(satz: Satz | null): void {
    this.element.classList.toggle('field-error', satz !== null);
    this.eingabe.setAttribute('aria-invalid', String(satz !== null));
    this.fehlerText.textContent = satz ? `${satz.titel} ${satz.text}` : '';
    this.fehlerText.hidden = satz === null;
  }
}
