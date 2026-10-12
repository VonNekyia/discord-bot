import { fileURLToPath } from 'node:url';
import { createCanvas, GlobalFonts, Image, loadImage, type Image as Bild } from '@napi-rs/canvas';
import { Glyphen, leseBereiche } from './glyphen.js';

// Siehe docs/benutzung/begruessung.md, „Banner“.
export const breite = 1100;
export const hoehe = 440;

// Die Schriften liegen im Repository, weil ein Server oft keine hat; aus
// Systemschriften ersetzt @napi-rs/canvas nichts. Inter für Latein und mehr,
// Noto Color Emoji für Emoji, Noto Sans CJK für Chinesisch, Japanisch und
// Koreanisch. Siehe docs/entscheidungen/0010-ersatzschriften-im-banner.md.
const schriften = { Inter: 'Inter-SemiBold.ttf', 'Noto Color Emoji': 'Noto-COLRv1.ttf', 'Noto Sans CJK': 'NotoSansCJKjp-Bold.otf' };
const pfad = (datei: string) => fileURLToPath(new URL(`../../../schrift/${datei}`, import.meta.url));
for (const [familie, datei] of Object.entries(schriften)) GlobalFonts.registerFromPath(pfad(datei), familie);

// Welche Zeichen die Schriften haben. Fehlt einer die cmap im Format 12,
// wirft schon das Laden. Siehe docs/entscheidungen/0018-zierbuchstaben-und-filter.md.
const glyphen = new Glyphen(Object.values(schriften).map((datei) => leseBereiche(pfad(datei))));

// `text` so, wie das Banner ihn ohne Kästchen zeichnen kann; siehe `Glyphen#zeichenbar`.
export function zeichenbar(text: string): string {
  return glyphen.zeichenbar(text);
}

// Fehlt einer Schrift ein Zeichen, nimmt @napi-rs/canvas die nächste, Zeichen
// für Zeichen. Die Reihenfolge zählt: Inter vor der Emoji-Schrift, damit
// Ziffern aus Inter kommen und nicht als Emoji.
export const schriftStapel = 'Inter, "Noto Color Emoji", "Noto Sans CJK"';

// Farben aus dem Design-Guide: Schleier `--veil`, Rand `--gold-light`, Ersatz für den Avatar `--ink-soft`.
const schleier = 'rgba(8, 15, 10, 0.55)';
const rand = '#f1d58d';
const ohneAvatar = '#25352b';

// Ein Bild, das nicht passt, mit Status und Code aus dem Vertrag.
// Siehe docs/schnittstelle/begruessung.md, „Bild“.
export class BildFehler extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

const signaturPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// PNG, JPEG oder WebP an der Signatur der Datei; sonst undefined.
// @napi-rs/canvas liest auch SVG, GIF und anderes; jeder weitere Decoder
// wäre Angriffsfläche. Siehe docs/bot/dashboard-api.md, „Bilder“.
export function format(daten: Buffer): 'png' | 'jpeg' | 'webp' | undefined {
  if (daten.subarray(0, 8).equals(signaturPng)) return 'png';
  if (daten[0] === 0xff && daten[1] === 0xd8 && daten[2] === 0xff) return 'jpeg';
  if (daten.toString('latin1', 0, 4) === 'RIFF' && daten.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  return undefined;
}

// Breite und Höhe aus dem Kopf der Datei, ohne zu dekodieren; 0, wenn der
// Kopf kein Bild ist. Vor einer EXIF-Drehung.
export function masse(daten: Buffer): { breite: number; hoehe: number } {
  const bild = new Image();
  bild.src = daten;
  return { breite: bild.width, hoehe: bild.height };
}

// Füllt die ganze Fläche mit `bild`, skaliert und mittig beschnitten.
function fuelle(g: ReturnType<ReturnType<typeof createCanvas>['getContext']>, bild: Bild): void {
  const faktor = Math.max(breite / bild.width, hoehe / bild.height);
  const w = bild.width * faktor;
  const h = bild.height * faktor;
  g.drawImage(bild, (breite - w) / 2, (hoehe - h) / 2, w, h);
}

// Prüft Signatur und Masse aus dem Kopf und dekodiert erst danach. Schneidet
// mittig auf 1100 × 440 zu und kodiert neu als WebP; EXIF und andere
// Metadaten fallen dabei weg. `loadImage` wendet die EXIF-Drehung an.
// Siehe docs/bot/dashboard-api.md, „Bilder“.
export async function bereiteVor(daten: Buffer): Promise<Buffer> {
  if (!format(daten)) throw new BildFehler(415, 'bild_unlesbar');
  const { breite: b, hoehe: h } = masse(daten);
  if (b === 0 || h === 0) throw new BildFehler(415, 'bild_unlesbar');
  if (b > 4096 || h > 4096) throw new BildFehler(413, 'bild_zu_gross');
  if (b < 200 || h < 200) throw new BildFehler(400, 'bild_zu_klein');
  let bild: Bild;
  try {
    bild = await loadImage(daten);
  } catch {
    throw new BildFehler(415, 'bild_unlesbar');
  }
  const flaeche = createCanvas(breite, hoehe);
  fuelle(flaeche.getContext('2d'), bild);
  return flaeche.encode('webp', 85);
}

// Kürzt `text` am Ende mit „…“, bis `passt` stimmt; nach ganzen Zeichen, auch Emoji.
function kuerze(text: string, passt: (s: string) => boolean): string {
  if (passt(text)) return text;
  const zeichen = [...new Intl.Segmenter('de', { granularity: 'grapheme' }).segment(text)].map((s) => s.segment);
  while (zeichen.length > 0 && !passt(`${zeichen.join('')}…`)) zeichen.pop();
  return `${zeichen.join('')}…`;
}

// Zeichnet das Banner als PNG: Hintergrund, Schleier, Avatar rund mit Rand,
// darunter `text` in einer Zeile, 64 bis 32 px. Ohne Avatar ein leerer Kreis.
// Siehe docs/benutzung/begruessung.md, „Banner“.
export async function zeichne(hintergrund: Buffer, avatar: Buffer | undefined, text: string): Promise<Buffer> {
  const flaeche = createCanvas(breite, hoehe);
  const g = flaeche.getContext('2d');
  fuelle(g, await loadImage(hintergrund));
  g.fillStyle = schleier;
  g.fillRect(0, 0, breite, hoehe);

  const x = breite / 2;
  const y = 150;
  const r = 100;
  const bild = avatar && (await loadImage(avatar).catch(() => undefined));
  g.save();
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.clip();
  if (bild) {
    g.drawImage(bild, x - r, y - r, 2 * r, 2 * r);
  } else {
    g.fillStyle = ohneAvatar;
    g.fill();
  }
  g.restore();
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.lineWidth = 6;
  g.strokeStyle = rand;
  g.stroke();

  // Nur, was eine Schrift hat; danach den Leerraum, der dabei doppelt wird.
  const zeile = zeichenbar(text).replaceAll(/\s+/g, ' ').trim();
  const breiteMax = breite - 2 * 60;
  let groesse = 64;
  g.font = `${groesse}px ${schriftStapel}`;
  while (groesse > 32 && g.measureText(zeile).width > breiteMax) g.font = `${(groesse -= 2)}px ${schriftStapel}`;
  g.fillStyle = '#ffffff';
  g.textAlign = 'center';
  g.fillText(kuerze(zeile, (s) => g.measureText(s).width <= breiteMax), x, 340 + groesse / 2);
  return flaeche.encode('png');
}

// Lädt einen Avatar; undefined, wenn er nicht kommt.
export async function holeAvatar(url: string): Promise<Buffer | undefined> {
  try {
    const antwort = await fetch(url, { signal: AbortSignal.timeout(5_000) });
    return antwort.ok ? Buffer.from(await antwort.arrayBuffer()) : undefined;
  } catch {
    return undefined;
  }
}
