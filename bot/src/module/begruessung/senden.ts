import {
  ChannelType,
  PermissionFlagsBits,
  type Guild,
  type GuildMember,
  type PartialGuildMember,
} from 'discord.js';
import type { Pool } from 'pg';
import { holeAvatar, zeichne } from './banner.js';
import { text as fehlertext } from '../../kern/fehler.js';
import { ersetze, liesBild, type Art, type Einstellung, type Werte } from './begruessung.js';

type Mitglied = GuildMember | PartialGuildMember;

// Was `begruesse` braucht: die Datenbank für das Bild, die Einstellungen
// über den Cache und die Bremse. Siehe docs/bot/begruessung-senden.md.
export interface SendeKontext {
  db: Pick<Pool, 'query'>;
  einstellungen: { fetch(server: string): Promise<Record<Art, Einstellung> | undefined> };
  avatar?: (url: string) => Promise<Buffer | undefined>;
  bremse?: Bremse<{ guild: Guild; art: Art }>;
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
  return { id: mitglied.id, name: mitglied.displayName, server: mitglied.guild.name, anzahl: mitglied.guild.memberCount };
}

// Der Text- oder Ankündigungskanal mit dieser ID und die Rechte des Bots dort.
function textkanal(guild: Guild, id: string) {
  const kanal = guild.channels.cache.get(id);
  const ich = guild.members.me;
  if (!ich || (kanal?.type !== ChannelType.GuildText && kanal?.type !== ChannelType.GuildAnnouncement)) return undefined;
  const rechte = kanal.permissionsFor(ich);
  if (!rechte.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) return undefined;
  return { kanal, anhaengen: rechte.has(PermissionFlagsBits.AttachFiles) };
}

// Das Banner für ein Mitglied; undefined ohne gespeichertes Bild.
export async function banner(mitglied: Mitglied, art: Art, vorlage: string, k: Pick<SendeKontext, 'db' | 'avatar'>): Promise<Buffer | undefined> {
  const hintergrund = await liesBild(k.db, mitglied.guild.id, art);
  if (!hintergrund) return undefined;
  return bannerPlaetze.nutze(async () => {
    const avatar = await (k.avatar ?? holeAvatar)(mitglied.displayAvatarURL({ extension: 'png', size: 256 }));
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
// darf; ohne Ping, ohne Banner.
async function fasseZusammen(guild: Guild, art: Art, zahl: number, k: Pick<SendeKontext, 'einstellungen'>): Promise<void> {
  console.log(`Begrüssung ${art}: Bremse aus, ${zahl} gezählt.`);
  try {
    const e = (await k.einstellungen.fetch(guild.id))?.[art];
    if (!e?.an || !e.kanal) return;
    const ziel = textkanal(guild, e.kanal);
    if (!ziel) {
      console.error(`Begrüssung ${art}: Kanal fehlt oder der Bot darf dort nicht senden.`);
      return;
    }
    await ziel.kanal.send({ content: zusammenfassung(art, zahl), allowedMentions: { parse: [] } });
  } catch (fehler) {
    console.error(`Begrüssung ${art}: Zusammenfassung nicht gesendet: ${fehlertext(fehler)}`);
  }
}

// Eine Bremse, die beim Lösen die Zusammenfassung schickt. `ruhe` ist nur
// für Tests kürzer als 30 s.
export function erstelleBremse(k: Pick<SendeKontext, 'einstellungen'>, ruhe = 30_000): Bremse<{ guild: Guild; art: Art }> {
  return new Bremse(({ guild, art }, zahl) => void fasseZusammen(guild, art, zahl, k), 5, 10_000, ruhe);
}

// Schickt die Begrüssung für `art`, wenn sie an ist, die Bremse nicht greift
// und der Bot im Kanal darf. Ins Log gehen nur die Art und der Grund, nie IDs
// oder Namen. Siehe docs/benutzung/begruessung.md, „Wenn etwas fehlt“.
export async function begruesse(mitglied: Mitglied, art: Art, k: SendeKontext): Promise<void> {
  const { guild } = mitglied;
  let e: Einstellung | undefined;
  try {
    e = (await k.einstellungen.fetch(guild.id))?.[art];
  } catch (fehler) {
    console.error(`Begrüssung ${art}: Einstellungen nicht gelesen: ${fehlertext(fehler)}`);
    return;
  }
  if (!e?.an || !e.kanal) return;
  // Die Bremse zählt erst hier, also nur, solange die Art an ist.
  const stand = k.bremse?.zaehle(`${guild.id}/${art}`, { guild, art }) ?? 'einzeln';
  if (stand === 'an') console.log(`Begrüssung ${art}: Bremse an.`);
  if (stand !== 'einzeln') return;

  const ziel = textkanal(guild, e.kanal);
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
  const allowedMentions = art === 'beitritt' ? { parse: [], users: [mitglied.id] } : { parse: [] };
  await ziel.kanal
    .send({
      ...(text.trim() === '' ? {} : { content: text }),
      files: datei ? [{ attachment: datei, name: `${art}.png` }] : [],
      allowedMentions,
    })
    .catch((fehler: unknown) => console.error(`Begrüssung ${art}: nicht gesendet: ${fehlertext(fehler)}`));
}

// Die Zeile vor jeder Testnachricht, als Untertext in Discord.
// Siehe docs/schnittstelle/api.md, „Testnachricht“.
export const testZeile = '-# Testnachricht aus dem Dashboard';

// Schickt eine Testnachricht mit `mitglied` als Mitglied, ohne Ping, auch wenn
// `an` aus ist. Die Regeln der API sind schon geprüft. Wirft, wenn nichts
// gesendet wurde. Siehe docs/schnittstelle/api.md, „Testnachricht“.
export async function sendeTest(
  mitglied: GuildMember,
  art: Art,
  e: Einstellung,
  k: Pick<SendeKontext, 'db' | 'avatar'>,
): Promise<{ banner: boolean }> {
  const ziel = e.kanal ? textkanal(mitglied.guild, e.kanal) : undefined;
  if (!ziel) throw new Error('Kanal fehlt oder der Bot darf dort nicht senden');
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
  await ziel.kanal.send({
    content: mitZeile.length <= 2000 ? mitZeile : text,
    files: datei ? [{ attachment: datei, name: `${art}.png` }] : [],
    allowedMentions: { parse: [] },
  });
  return { banner: datei !== undefined };
}
