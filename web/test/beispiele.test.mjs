// Misst die Prüfer aus src/api/klient.ts an den Beispielen des Vertrags in
// docs/schnittstelle/beispiele/: Jedes Beispiel muss der Prüfer seines Typs
// annehmen, und zusammen zeigen sie jeden Typ, jede Art von Baustein und
// jedes Feld, das ein Prüfer liest. Node liest klient.ts ohne Build.
// Siehe docs/entwicklung/tests.md, „Die Oberfläche“.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { arten, pruefer } from '../src/api/klient.ts';

const ordner = new URL('../../docs/schnittstelle/beispiele/', import.meta.url);

function dateien() {
  try {
    return readdirSync(ordner)
      .filter((datei) => datei.endsWith('.json'))
      .toSorted();
  } catch {
    return [];
  }
}

// Je Ort die Felder, die ein Prüfer liest, und die, die dort einen Wert haben.
// Ort ist der Typ mit dem Pfad dorthin, ohne Index; ein Baustein beginnt einen
// eigenen Ort mit seiner Art, egal wie tief er steht.
const gelesen = new Map();
const belegt = new Map();
const merke = (karte, ort, feld) => {
  if (!karte.has(ort)) karte.set(ort, new Set());
  karte.get(ort).add(feld);
};
// Ein Wert, bei dem auch die Prüfer darin laufen: nicht null, nicht [] und nicht {}.
const voll = (wert) => wert != null && !(typeof wert === 'object' && Object.keys(wert).length === 0);

// Hüllt ein Beispiel in Proxys, die mitschreiben, was der Prüfer liest. Ein
// Objekt, das er aufzählt, ist eine Tabelle wie `wert` oder `saetze`: Ihre
// Schlüssel sind Daten, keine Felder.
function beobachte(wert, ort) {
  if (typeof wert !== 'object' || wert === null) return wert;
  if (Array.isArray(wert)) {
    return new Proxy(wert, {
      get: (ziel, schluessel) => (typeof schluessel === 'string' && /^\d+$/.test(schluessel) ? beobachte(ziel[schluessel], `${ort}[]`) : Reflect.get(ziel, schluessel)),
    });
  }
  const hier = /\.(bausteine|daneben)\[\]$/.test(ort) && typeof wert.art === 'string' ? `Baustein(${wert.art})` : ort;
  let tabelle = false;
  return new Proxy(wert, {
    ownKeys(ziel) {
      tabelle = true;
      return Reflect.ownKeys(ziel);
    },
    get(ziel, schluessel) {
      if (typeof schluessel !== 'string') return Reflect.get(ziel, schluessel);
      if (tabelle) return beobachte(ziel[schluessel], `${hier}.*`);
      merke(gelesen, hier, schluessel);
      if (voll(ziel[schluessel])) merke(belegt, hier, schluessel);
      return beobachte(ziel[schluessel], `${hier}.${schluessel}`);
    },
  });
}

// Jede Art, die auf einer Seite vorkommt, auch in einer Liste.
const gesehen = new Set();
function sammle(bausteine) {
  for (const b of bausteine) {
    gesehen.add(b.art);
    if (b.art === 'liste') sammle(b.bausteine);
  }
}

const beispiele = dateien().map((datei) => {
  const inhalt = JSON.parse(readFileSync(new URL(datei, ordner), 'utf8'));
  const bekannt = typeof inhalt.typ === 'string' && Object.hasOwn(pruefer, inhalt.typ);
  const wert = bekannt ? pruefer[inhalt.typ](beobachte(inhalt.body, inhalt.typ.replace(/\[\]$/, ''))) : undefined;
  if (inhalt.typ === 'Seite[]' && wert) for (const seite of wert) sammle([...seite.bausteine, ...seite.daneben]);
  return { datei, inhalt, bekannt, wert };
});

for (const { datei, inhalt, bekannt, wert } of beispiele) {
  test(`${datei}: ${String(inhalt.typ)}`, (t) => {
    assert.ok(typeof inhalt.route === 'string' && Number.isInteger(inhalt.status) && typeof inhalt.typ === 'string' && 'body' in inhalt, 'ein Beispiel hat route, status, typ und body');
    if (!bekannt) {
      t.skip(`die Oberfläche prüft ${inhalt.typ} noch nicht`);
      return;
    }
    assert.notEqual(wert, undefined, `der Prüfer für ${inhalt.typ} lehnt das Beispiel ab`);
    if (inhalt.typ !== 'Seite[]') return;
    for (const seite of wert) {
      // Passt ein Baustein in einer Liste nicht, wird die ganze Liste `unbekannt`.
      const unbekannt = [...seite.bausteine, ...seite.daneben].filter((b) => b.art === 'unbekannt').map((b) => b.id);
      assert.deepEqual(unbekannt, [], `auf der Seite ${seite.id} passen diese Bausteine nicht`);
    }
  });
}

test('jeder Typ, den die Oberfläche prüft, hat ein Beispiel', () => {
  const ohne = Object.keys(pruefer).filter((typ) => !beispiele.some((b) => b.inhalt.typ === typ));
  assert.deepEqual(ohne, [], `ohne Beispiel in ${ordner.pathname}`);
});

test('jede Art von Baustein kommt in einem Beispiel vor', () => {
  assert.deepEqual(
    arten.filter((art) => !gesehen.has(art)),
    [],
    'diese Arten zeigt kein Beispiel',
  );
});

test('jedes Feld, das ein Prüfer liest, hat in einem Beispiel einen Wert', () => {
  const ohne = [...gelesen].flatMap(([ort, felder]) => [...felder].filter((feld) => !belegt.get(ort)?.has(feld)).map((feld) => `${ort}.${feld}`));
  assert.deepEqual(ohne.toSorted(), [], 'nie gesetzt, oder nur null, [] oder {}');
});
