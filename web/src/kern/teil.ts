// Was ein Baustein der Seite gibt und was er von ihr braucht. Jede Art von
// Baustein in src/bausteine/ baut aus ihrer Beschreibung einen Teil.
// Siehe docs/frontend/dashboard.md, „Bausteine“.
import type { Baustein, Bedingung, Option, Satz, Wert } from '../api/klient.js';

export interface Teil {
  // Was in das Formular kommt, in dieser Reihenfolge, je mit dem Abstand des Formulars.
  readonly elemente: readonly HTMLElement[];
  // Der Wert für `wert` der Seite; fehlt bei Bausteinen ohne Wert.
  wert?(): Wert;
  // Prüft, was der Baustein selbst beschreibt, und zeigt den Fehler am Feld.
  // Mit `alles` auch, was erst beim Speichern zählt. true, wenn alles passt.
  pruefe?(alles: boolean): boolean;
  // Zeigt den Satz zu `code` am Feld; `pfad` führt in eine Liste. false,
  // wenn der Baustein dort keinen Fehler zeigen kann.
  melde?(code: string, pfad: readonly string[]): boolean;
  // Etwas auf der Seite hat sich geändert. true, wenn der Baustein dabei
  // seinen Wert selbst geändert hat, etwa ein gesperrter Schalter.
  aktualisiere?(): boolean;
  // Nach dem Speichern und nach jedem Hochladen, etwa eine Vorschau.
  ladeNeu?(): void;
  // Die gewählte Option, für Bedingungen und den Kopf einer Liste.
  option?(): Option | undefined;
  // Direkt vor dem Senden: merkt sich die Reihenfolge einer Liste, denn ein
  // Fehler nennt den Eintrag, wie er gesendet wurde.
  merke?(): void;
}

export interface Umgebung {
  // Eine ID, die es im Dokument nur einmal gibt.
  id(name: string): string;
  // Der Satz zu einem Code oder einem Fehler: aus der Seite, sonst allgemein.
  satz(fehler: unknown): Satz;
  // Wert und gewählte Option eines anderen Bausteins derselben Ebene.
  wert(feld: string): Wert | undefined;
  option(feld: string): Option | undefined;
  // In einer Liste: die Werte desselben Felds in den Einträgen davor und danach.
  geschwister(feld: string): Geschwister;
  // Ein Wert hat sich geändert; mit `neuLaden` auch eine Datei auf dem Server.
  geaendert(neuLaden?: boolean): void;
  // Baut einen Baustein; eine Liste baut so ihre Einträge.
  baue(b: Baustein, u: Umgebung, start: Wert | undefined): Teil;
  // Die Umgebung eines Eintrags einer Liste.
  innen(praefix: string, teile: ReadonlyMap<string, Teil>, geschwister: (feld: string) => Geschwister): Umgebung;
  // Die Routen eines Bausteins. Siehe docs/schnittstelle/baukasten.md, „Routen“.
  hochladen(baustein: string, datei: File): Promise<void>;
  loeschen(baustein: string): Promise<void>;
  ausloesen(baustein: string): Promise<Satz>;
  bild(baustein: string): string;
  // Ein Fehler einer Anfrage: bei 401 die Anmeldung, mit `feld` am Feld,
  // sonst als Meldung in `ort`.
  zeige(fehler: unknown, ort: HTMLElement): void;
  // Vor einer Aktion: nur noch die Fehler der eigenen Prüfung, ohne die aus früheren Antworten.
  pruefeNeu(): void;
  // Ob das Formular vom gespeicherten Stand abweicht.
  ungespeichert(): boolean;
}

export type Geschwister = { vorher: Wert[]; nachher: Wert[] };

export type Bauer<B extends Baustein> = (b: B, u: Umgebung, start: Wert | undefined) => Teil;

// Erfüllt, wenn der Wert gesetzt ist und, mit `merkmal`, die gewählte
// Option es hat. Siehe docs/schnittstelle/baukasten.md, „Typen“.
export function erfuellt(b: Bedingung, u: Umgebung): boolean {
  const wert = u.wert(b.feld);
  if (wert === undefined || wert === null || wert === false || wert === '' || (Array.isArray(wert) && wert.length === 0)) return false;
  return b.merkmal === undefined || (u.option(b.feld)?.merkmale.includes(b.merkmal) ?? false);
}
