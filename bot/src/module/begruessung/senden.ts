import type { Pool } from 'pg';
import { holeAvatar, zeichne } from './banner.js';
import { text as fehlertext } from '../../kern/fehler.js';
import type { Zaehlung } from '../../kern/zaehlung.js';
import { ersetze, liesBild, type Art, type Einstellung, type Werte } from './begruessung.js';
import type { Mitglied, Textkanal } from '../../discord/nachrichten.js';

// Was `begruesse` braucht: die Datenbank für das Bild, die Einstellungen
// über den Cache und die Bremse. Siehe docs/bot/begruessung-senden.md.
export interface SendeKontext {
  db: Pick<Pool, 'query'>;
  einstellungen: { fetch(server: string): Promise<Record<Art, Einstellung> | undefined> };
  avatar?: (url: string) => Promise<Buffer | undefined>;
  bremse?: Bremse<{ server: string; art: Art }>;
  // Der Textkanal, in dem der Bot senden darf, über die IDs von Server und
  // Kanal; im Bot `textkanalAuf` aus der Discord-Schicht.
  kanal: (server: string, kanal: string) => Textkanal | undefined;
  // Zählt, wie oft die Bremse greift. Siehe docs/bot/rate-limits.md, „Eigene Grenzen“.
  zaehlung?: Pick<Zaehlung, 'griff'>;
}

// Lässt höchstens `anzahl` Aufgaben zugleich laufen; weitere warten der Reihe nach.
export class Plaetze {
  private laufend = 0;
  private readonly wartend: (() => void)[] = [];

  constructor(private readonly anzahl: number) {}

  async nutze<T>(aufgabe: () => Promise<T>): Promise<T> {
    if (this.laufend < this.anzahl) this.laufend++;
    else await new Promise<void>((weiter) => this.wartend.push(weiter));
    try {
      return await aufgabe();
    } finally {
      // Der Platz geht direkt an den Nächsten; sonst wird er frei.
      const naechster = this.wartend.shift();
      if (naechster) naechster();
      else this.laufend--;
    }
  }
}

// Höchstens zwei Banner zugleich, beim Senden, bei der Testnachricht und in
// der Vorschau. Siehe docs/bot/begruessung-senden.md, „Bremse“.
const bannerPlaetze = new Plaetze(2);

function werte(mitglied: Mitglied): Werte {
  return { id: mitglied.id, name: mitglied.name, server: mitglied.server.name, anzahl: mitglied.server.anzahl };
}

// Das Banner für ein Mitglied; undefined ohne gespeichertes Bild.
export async function banner(mitglied: Mitglied, art: Art, vorlage: string, k: Pick<SendeKontext, 'db' | 'avatar'>): Promise<Buffer | undefined> {
  const hintergrund = await liesBild(k.db, mitglied.server.id, art);
  if (!hintergrund) return undefined;
  return bannerPlaetze.nutze(async () => {
    const avatar = await (k.avatar ?? holeAvatar)(mitglied.avatar);
    return zeichne(hintergrund, avatar, ersetze(vorlage, werte(mitglied), 'banner'));
  });
}

// Zählt Ereignisse je Schlüssel. Bis `schwelle` in `fenster` ms gehen sie
// einzeln; danach nur gezählt, bis `ruhe` ms lang keins kommt. Dann ruft sie
// `loese` mit der Zahl der gezählten. Siehe docs/benutzung/begruessung.md, „Bremse“.
export class Bremse<T> {
  private readonly zustand = new Map<string, { zeiten: number[]; gezaehlt: number; daten: T; uhr?: ReturnType<typeof setTimeout> }>();

  constructor(
    private readonly loese: (daten: T, zahl: number) => void,
    private readonly schwelle = 5,
    private readonly fenster = 10_000,
    private readonly ruhe = 30_000,
  ) {}

  // 'einzeln': wie eingestellt senden; 'an': die Bremse greift gerade; 'gezaehlt': nur zählen.
  zaehle(schluessel: string, daten: T): 'einzeln' | 'an' | 'gezaehlt' {
    const jetzt = Date.now();
    const z = this.zustand.get(schluessel) ?? { zeiten: [], gezaehlt: 0, daten };
    z.daten = daten;
    z.zeiten = [...z.zeiten.filter((zeit) => zeit > jetzt - this.fenster), jetzt];
    if (z.gezaehlt === 0 && z.zeiten.length <= this.schwelle) {
      this.zustand.set(schluessel, z);
      return 'einzeln';
    }
    z.gezaehlt++;
    clearTimeout(z.uhr);
    z.uhr = setTimeout(() => {
      this.zustand.delete(schluessel);
      this.loese(z.daten, z.gezaehlt);
    }, this.ruhe);
    z.uhr.unref?.();
    this.zustand.set(schluessel, z);
    return z.gezaehlt === 1 ? 'an' : 'gezaehlt';
  }
}

// Der Text, wenn sich die Bremse löst. Siehe docs/benutzung/begruessung.md, „Bremse“.
export function zusammenfassung(art: Art, zahl: number): string {
  if (art === 'beitritt') return zahl === 1 ? 'Willkommen an das neue Mitglied!' : `Willkommen an die ${zahl} neuen Mitglieder!`;
  return zahl === 1 ? '1 Mitglied hat den Server verlassen.' : `${zahl} Mitglieder haben den Server verlassen.`;
}

// Schickt die Zusammenfassung, wenn die Art noch an ist und der Bot im Kanal
// darf; ohne Ping, ohne Banner. Den Kanal sucht sie erst jetzt: In 30 s
// können sich Einstellung und Rechte ändern.
async function fasseZusammen(server: string, art: Art, zahl: number, k: Pick<SendeKontext, 'einstellungen' | 'kanal'>): Promise<void> {
  console.log(`Begrüssung ${art}: Bremse aus, ${zahl} gezählt.`);
  try {
    const e = (await k.einstellungen.fetch(server))?.[art];
    if (!e?.an || !e.kanal) return;
    const ziel = k.kanal(server, e.kanal);
    if (!ziel) {
      console.error(`Begrüssung ${art}: Kanal fehlt oder der Bot darf dort nicht senden.`);
      return;
    }
    await ziel.sende({ text: zusammenfassung(art, zahl) });
  } catch (fehler) {
    console.error(`Begrüssung ${art}: Zusammenfassung nicht gesendet: ${fehlertext(fehler)}`);
  }
}

// Eine Bremse, die beim Lösen die Zusammenfassung schickt. `ruhe` ist nur
// für Tests kürzer als 30 s.
export function erstelleBremse(k: Pick<SendeKontext, 'einstellungen' | 'kanal'>, ruhe = 30_000): Bremse<{ server: string; art: Art }> {
  return new Bremse(({ server, art }, zahl) => void fasseZusammen(server, art, zahl, k), 5, 10_000, ruhe);
}

// Schickt die Begrüssung für `art`, wenn sie an ist, die Bremse nicht greift
// und der Bot im Kanal darf. Ins Log gehen nur die Art und der Grund, nie IDs
// oder Namen. Siehe docs/benutzung/begruessung.md, „Wenn etwas fehlt“.
export async function begruesse(mitglied: Mitglied, art: Art, k: SendeKontext): Promise<void> {
  const server = mitglied.server.id;
  let e: Einstellung | undefined;
  try {
    e = (await k.einstellungen.fetch(server))?.[art];
  } catch (fehler) {
    console.error(`Begrüssung ${art}: Einstellungen nicht gelesen: ${fehlertext(fehler)}`);
    return;
  }
  if (!e?.an || !e.kanal) return;
  // Die Bremse zählt erst hier, also nur, solange die Art an ist.
  const stand = k.bremse?.zaehle(`${server}/${art}`, { server, art }) ?? 'einzeln';
  if (stand === 'an') {
    console.log(`Begrüssung ${art}: Bremse an.`);
    k.zaehlung?.griff('bremse');
  }
  if (stand !== 'einzeln') return;

  const ziel = k.kanal(server, e.kanal);
  if (!ziel) {
    console.error(`Begrüssung ${art}: Kanal fehlt oder der Bot darf dort nicht senden.`);
    return;
  }
  const text = ersetze(e.text, werte(mitglied), 'text');
  let datei: Buffer | undefined;
  if (e.banner && e.bild) {
    if (!ziel.anhaengen) {
      console.error(`Begrüssung ${art}: Banner ohne „Dateien anhängen“, nur der Text.`);
    } else {
      datei = await banner(mitglied, art, e.bannerText, k).catch((fehler: unknown) => {
        console.error(`Begrüssung ${art}: Banner gescheitert, nur der Text: ${fehlertext(fehler)}`);
        return undefined;
      });
    }
  }
  if (text.trim() === '' && !datei) return;

  // Beim Beitritt pingt nur das neue Mitglied, beim Abschied niemand.
  // Siehe docs/benutzung/begruessung.md, „Platzhalter“.
  await ziel
    .sende({
      ...(text.trim() === '' ? {} : { text }),
      ...(datei ? { datei: { name: `${art}.png`, daten: datei } } : {}),
      pingt: art === 'beitritt' ? [mitglied.id] : [],
    })
    .catch((fehler: unknown) => console.error(`Begrüssung ${art}: nicht gesendet: ${fehlertext(fehler)}`));
}

// Die Zeile vor jeder Testnachricht, als Untertext in Discord.
// Siehe docs/schnittstelle/begruessung.md, „Testnachricht“.
export const testZeile = '-# Testnachricht aus dem Dashboard';

// Schickt eine Testnachricht mit `mitglied` als Mitglied in `ziel`, ohne
// Ping, auch wenn `an` aus ist. Die Regeln der API sind schon geprüft. Wirft,
// wenn nichts gesendet wurde. Siehe docs/schnittstelle/begruessung.md, „Testnachricht“.
export async function sendeTest(
  mitglied: Mitglied,
  ziel: Textkanal,
  art: Art,
  e: Einstellung,
  k: Pick<SendeKontext, 'db' | 'avatar'>,
): Promise<{ banner: boolean }> {
  const text = ersetze(e.text, werte(mitglied), 'text');
  let datei: Buffer | undefined;
  if (e.banner && e.bild && ziel.anhaengen) {
    datei = await banner(mitglied, art, e.bannerText, k).catch((fehler: unknown) => {
      console.error(`Testnachricht ${art}: Banner gescheitert: ${fehlertext(fehler)}`);
      return undefined;
    });
  }
  if (text.trim() === '' && !datei) throw new Error('nichts zu senden, das Banner ist gescheitert');
  const mitZeile = text.trim() === '' ? testZeile : `${testZeile}\n${text}`;
  await ziel.sende({
    text: mitZeile.length <= 2000 ? mitZeile : text,
    ...(datei ? { datei: { name: `${art}.png`, daten: datei } } : {}),
  });
  return { banner: datei !== undefined };
}
