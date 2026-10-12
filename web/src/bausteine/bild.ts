// Ein Bild: Datei-Feld im Feld aus dem Guide, darunter ein Link-Knopf zum
// Entfernen. Prüft die Datei wie der Bot und lädt sie sofort hoch.
// Siehe docs/schnittstelle/baukasten.md, „Bausteine“.
import { ApiFehler, type Bild } from '../api/klient.js';
import { Feld } from '../kern/feld.js';
import type { Bauer } from '../kern/teil.js';

// Der Code des ersten Fehlers, wie der Bot prüft, oder null.
// Siehe docs/schnittstelle/baukasten.md, „Prüfen in der Oberfläche“.
async function pruefeDatei(b: Bild, datei: File): Promise<string | null> {
  if (!b.typen.includes(datei.type)) return 'bildtyp';
  if (datei.size > b.groesse) return 'bild_zu_gross';
  let bild: ImageBitmap;
  try {
    bild = await createImageBitmap(datei);
  } catch {
    return 'bild_unlesbar';
  }
  const { width, height } = bild;
  bild.close();
  if (width > b.pixel.max || height > b.pixel.max) return 'bild_zu_gross';
  if (width < b.pixel.min || height < b.pixel.min) return 'bild_zu_klein';
  return null;
}

export const bild: Bauer<Bild> = (b, u, start) => {
  const eingabe = document.createElement('input');
  eingabe.type = 'file';
  eingabe.accept = b.typen.join(',');
  const feld = new Feld(u, b.id, b.titel, eingabe, b.hilfe);
  const entfernen = document.createElement('button');
  entfernen.type = 'button';
  entfernen.className = 'link-button';
  entfernen.textContent = b.entfernen;
  let da = start === true;
  entfernen.hidden = !da;

  // Fehler beim Hochladen und Löschen stehen am Feld; bei 401 zeigt die Seite die Anmeldung.
  const fehler = (f: unknown) => {
    if (f instanceof ApiFehler && f.status === 401) u.zeige(f, feld.element);
    else feld.fehler(u.satz(f));
  };

  const setze = (jetzt: boolean) => {
    da = jetzt;
    entfernen.hidden = !da;
    u.geaendert(true);
  };

  eingabe.addEventListener('change', () => {
    const datei = eingabe.files?.[0];
    if (!datei) return;
    feld.fehler(null);
    eingabe.disabled = true;
    void (async () => {
      try {
        const code = await pruefeDatei(b, datei);
        if (code) return feld.fehler(u.satz(code));
        await u.hochladen(b.id, datei);
        setze(true);
      } catch (f) {
        fehler(f);
      } finally {
        eingabe.disabled = false;
        eingabe.value = '';
      }
    })();
  });

  entfernen.addEventListener('click', () => {
    feld.fehler(null);
    entfernen.disabled = true;
    void (async () => {
      try {
        await u.loeschen(b.id);
        setze(false);
      } catch (f) {
        fehler(f);
      } finally {
        entfernen.disabled = false;
      }
    })();
  });

  const melde = (code: string): boolean => {
    feld.fehler(u.satz(code));
    return true;
  };

  return { elemente: [feld.element, entfernen], wert: () => da, melde };
};
