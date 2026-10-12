import type { Pool } from 'pg';
import { text as fehlertext } from '../../kern/fehler.js';
import { ohneHasszeichen } from '../../kern/namen.js';
import { DiscordFehler } from '../../discord/fehler.js';
import type { Druck } from '../../discord/interaktionen.js';
import type { Server } from '../../discord/server.js';
import { belegung, sprachraum, verschiebe, type Sprachraum } from '../../discord/sprachkanaele.js';
import { aktionen, auswahl, formular, mitAuswahl, mitFormular, type Aktion, type MitAuswahl } from './menue.js';
import { besitzerVon } from './raeume.js';
import * as rechte from './raumrechte.js';

export interface KnopfKontext {
  db: Pick<Pool, 'query'>;
}

// Feste Gründe im Audit-Log, ohne IDs und Namen.
// Siehe docs/bot/sprachraeume-menue.md, „Audit-Log und Log“.
const grund = {
  sperren: 'Sprachraum: gesperrt',
  entsperren: 'Sprachraum: entsperrt',
  verstecken: 'Sprachraum: versteckt',
  zeigen: 'Sprachraum: gezeigt',
  umbenennen: 'Sprachraum: umbenannt',
  limit: 'Sprachraum: Limit geändert',
  rauswerfen: 'Sprachraum: rausgeworfen',
  bannen: 'Sprachraum: gebannt',
  entbannen: 'Sprachraum: entbannt',
  uebergeben: 'Sprachraum: Besitz übergeben',
  uebernehmen: 'Sprachraum: übernommen',
} as const;

const keinRaum = 'Das ist kein Sprachraum mehr.';
const nurBesitzer = (besitzer: string) => `Das darf nur der Besitzer: <@${besitzer}>.`;

const istAktion = (a: string): a is Aktion => aktionen.some((x) => x === a);

// Die Wartezeit aus einem RateLimitError in Sekunden oder angefangenen
// Minuten. `retryAfter` enthält 50 ms `offset`; darum gerundet, nicht aufgerundet.
export function dauer(ms: number): string {
  const s = Math.max(1, Math.round(ms / 1000));
  return s < 60 ? `${s} s` : `${Math.ceil(s / 60)} min`;
}

interface Lage {
  server: Server;
  raum: Sprachraum;
  besitzer: string;
  nutzer: string;
  bot: string;
}

function stand(l: Lage): rechte.Raum {
  return {
    eintraege: l.raum.eintraege,
    kategorie: l.raum.kategorieEintraege,
    server: l.server.id,
    besitzer: l.besitzer,
    bot: l.bot,
  };
}

// Wer im Raum ist, ohne den Bot.
const drin = (l: Lage) => belegung(l.server, l.raum.id).filter((id) => id !== l.bot);

const ja = (wert: boolean) => (wert ? 'ja' : 'nein');

const nichtVerbunden = (fehler: unknown) => fehler instanceof DiscordFehler && fehler.code === 'nicht_verbunden';

// Ein Fehler von PostgreSQL wegen eines doppelten Schlüssels.
const doppelt = (fehler: unknown) => fehler instanceof Error && 'code' in fehler && fehler.code === '23505';

// Die Knöpfe des Menüs. Ein Knopf wirkt auf den Raum, in dessen Chat er
// steht (`Druck#kanal`); jede Antwort ist ephemeral.
// Siehe docs/benutzung/sprachraeume.md, „Menü“.
// Siehe docs/bot/sprachraeume-menue.md, „Antworten“.
export class Knoepfe {
  // Je Raum eins nach dem anderen: Die Rechte rechnet der Bot aus dem Cache.
  // Siehe docs/bot/sprachraeume-menue.md, „Eins nach dem anderen je Raum“.
  private readonly ketten = new Map<string, Promise<unknown>>();

  constructor(private readonly k: KnopfKontext) {}

  async bediene(d: Druck): Promise<void> {
    const { aktion } = d;
    try {
      if (!istAktion(aktion)) {
        await d.antworte('Diesen Knopf kennt der Bot nicht.');
        return;
      }
      // Formular und Auswahl öffnen nur für den Besitzer; ein Formular muss die erste Antwort sein.
      if (d.art === 'knopf' && (mitFormular(aktion) || mitAuswahl(aktion))) {
        const l = await this.lage(d);
        if (typeof l === 'string' || l.nutzer !== l.besitzer) {
          await d.antworte(typeof l === 'string' ? l : nurBesitzer(l.besitzer));
        } else if (mitFormular(aktion)) {
          await d.zeigeFormular(formular(aktion, { name: l.raum.name, limit: l.raum.limit }));
        } else {
          await d.zeigeAuswahl(auswahl(aktion));
        }
        return;
      }
      // Vor jedem Aufruf an Discord: Discord wartet höchstens 3 s auf die erste Antwort.
      await d.warte();
      const antwort = await this.nacheinander(d.kanal ?? '', () => this.fuehreAus(d, aktion));
      await d.fertig(antwort);
    } catch (fehler) {
      console.error(`Sprachraum-Menü: ${fehlertext(fehler)}`);
      const senden = d.beantwortet ? d.fertig('Das hat nicht geklappt.') : d.antworte('Das hat nicht geklappt.');
      await senden.catch((e: unknown) => console.error(`Sprachraum-Menü: Antwort fehlgeschlagen: ${fehlertext(e)}`));
    }
  }

  private nacheinander<T>(schluessel: string, aufgabe: () => Promise<T>): Promise<T> {
    const davor = this.ketten.get(schluessel) ?? Promise.resolve();
    const diese = davor.catch(() => undefined).then(aufgabe);
    this.ketten.set(schluessel, diese);
    void diese.catch(() => undefined).finally(() => {
      if (this.ketten.get(schluessel) === diese) this.ketten.delete(schluessel);
    });
    return diese;
  }

  private async lage(d: Druck): Promise<Lage | string> {
    const raum = d.kanal ? sprachraum(d.server, d.kanal) : undefined;
    if (!raum) return keinRaum;
    const besitzer = await besitzerVon(this.k.db, raum.id);
    if (!besitzer) return keinRaum;
    return { server: d.server, raum, besitzer, nutzer: d.nutzer, bot: d.bot };
  }

  // Führt eine Aktion aus und gibt die Antwort zurück. Fehler, die Discord
  // erwarten lässt, werden zu einem Hinweis; andere wirft sie weiter.
  private async fuehreAus(d: Druck, aktion: Aktion): Promise<string> {
    const l = await this.lage(d);
    if (typeof l === 'string') return l;
    try {
      if (aktion === 'info') return this.info(l);
      if (aktion === 'uebernehmen') return await this.uebernehmen(l);
      if (l.nutzer !== l.besitzer) return nurBesitzer(l.besitzer);
      if (d.art === 'auswahl' && mitAuswahl(aktion)) return await this.mitZiel(l, aktion, d.ziel?.id ?? '', d.ziel?.bot ?? false);
      if (d.art === 'formular' && aktion === 'umbenennen') return await this.umbenennen(l, d.wert ?? '');
      if (d.art === 'formular' && aktion === 'limit') return await this.limit(l, d.wert ?? '');
      if (d.art === 'knopf' && (aktion === 'sperren' || aktion === 'entsperren' || aktion === 'verstecken' || aktion === 'zeigen')) {
        return await this.zugang(l, aktion);
      }
      return 'Diesen Knopf kennt der Bot nicht.';
    } catch (fehler) {
      if (!(fehler instanceof DiscordFehler)) throw fehler;
      if (fehler.code === 'zu_schnell') {
        const warten = dauer(fehler.warten ?? 0);
        return aktion === 'umbenennen' ? `Discord lässt den Raum erst in ${warten} wieder umbenennen.` : `Discord lässt das erst in ${warten} wieder zu.`;
      }
      if (fehler.code === 'nicht_gefunden') return keinRaum;
      if (fehler.code === 'zu_viele_eintraege') return 'Der Raum hat so viele Rechte-Einträge, dass Discord keinen weiteren nimmt.';
      if (fehler.code === 'kein_recht') {
        console.error(`Sprachraum-Menü: ${fehlertext(fehler)}`);
        return 'Dem Bot fehlt dafür ein Recht. Sag dem Team Bescheid.';
      }
      throw fehler;
    }
  }

  private async zugang(l: Lage, aktion: 'sperren' | 'entsperren' | 'verstecken' | 'zeigen'): Promise<string> {
    const r = stand(l);
    const zu = aktion === 'sperren' || aktion === 'entsperren' ? rechte.gesperrt(r) : rechte.versteckt(r);
    const was = {
      sperren: { schon: zu, hinweis: 'Der Raum ist schon gesperrt.', neu: () => rechte.sperre(r, drin(l)), fertig: 'Gesperrt. Wer gerade drin ist, kommt auch nach dem Gehen wieder hinein.' },
      entsperren: { schon: !zu, hinweis: 'Der Raum ist nicht gesperrt.', neu: () => rechte.entsperre(r), fertig: 'Entsperrt. Beitreten darf wieder, wer die Kategorie betreten darf.' },
      verstecken: { schon: zu, hinweis: 'Der Raum ist schon versteckt.', neu: () => rechte.verstecke(r, drin(l)), fertig: 'Versteckt. Wer gerade drin ist, sieht den Raum weiter.' },
      zeigen: { schon: !zu, hinweis: 'Der Raum ist nicht versteckt.', neu: () => rechte.zeige(r), fertig: 'Wieder sichtbar für alle, die die Kategorie sehen.' },
    }[aktion];
    if (was.schon) return was.hinweis;
    await l.raum.setzeRechte(was.neu(), grund[aktion]);
    return was.fertig;
  }

  private async umbenennen(l: Lage, wert: string): Promise<string> {
    // Der Bot schreibt keine Hasszeichen; bleibt nichts, gilt der Hinweis für einen leeren Namen.
    const name = ohneHasszeichen(wert).trim();
    if (name.length < 1 || name.length > 100) return 'Ein Name hat 1 bis 100 Zeichen.';
    await l.raum.benenne(name, grund.umbenennen);
    return 'Umbenannt.';
  }

  private async limit(l: Lage, wert: string): Promise<string> {
    if (!/^\d{1,2}$/.test(wert.trim())) return 'Das Limit ist eine Zahl von 0 bis 99.';
    const zahl = Number(wert.trim());
    await l.raum.setzeLimit(zahl, grund.limit);
    return zahl === 0 ? 'Der Raum hat kein Limit mehr.' : `Das Limit ist jetzt ${zahl}.`;
  }

  // `istBot` kommt aus der Nutzerauswahl; Rauswerfen und Bannen treffen auch Bots.
  private async mitZiel(l: Lage, aktion: MitAuswahl, ziel: string, istBot: boolean): Promise<string> {
    const verb = { rauswerfen: 'rauswerfen', bannen: 'bannen', entbannen: 'entbannen', uebergeben: 'zum Besitzer machen' }[aktion];
    if (ziel === l.nutzer && aktion !== 'entbannen') return `Dich selbst kannst du nicht ${verb}.`;
    if (ziel === l.bot && aktion !== 'entbannen') return `Den Bot kannst du nicht ${verb}.`;
    const wer = `<@${ziel}>`;
    const r = stand(l);
    const istDrin = drin(l).includes(ziel);
    if (aktion === 'rauswerfen') {
      if (!istDrin) return `${wer} ist nicht im Raum.`;
      try {
        await verschiebe(l.server, ziel, null, grund.rauswerfen);
      } catch (fehler) {
        if (nichtVerbunden(fehler)) return `${wer} ist nicht im Raum.`;
        throw fehler;
      }
      return `${wer} ist raus.`;
    }
    if (aktion === 'bannen') {
      if (rechte.gebannt(r).includes(ziel)) return `${wer} ist schon gebannt.`;
      await l.raum.setzeRechte(rechte.banne(r, ziel), grund.bannen);
      if (istDrin) {
        await verschiebe(l.server, ziel, null, grund.bannen).catch((fehler: unknown) => {
          if (!nichtVerbunden(fehler)) throw fehler;
        });
      }
      return `${wer} ist gebannt.`;
    }
    if (aktion === 'entbannen') {
      if (!rechte.gebannt(r).includes(ziel)) return `${wer} ist nicht gebannt.`;
      await l.raum.setzeRechte(rechte.entbanne(r, ziel), grund.entbannen);
      return `${wer} ist nicht mehr gebannt.`;
    }
    // Kein Bot wird Besitzer: Bliebe er im Raum, ginge auch „Übernehmen“ nicht mehr.
    if (istBot) return 'Einem Bot kannst du den Raum nicht übergeben.';
    if (!istDrin) return `${wer} ist nicht im Raum.`;
    return this.neuerBesitzer(l, ziel, grund.uebergeben, `${wer} ist jetzt Besitzer.`, `${wer} hat schon einen eigenen Raum.`);
  }

  private async uebernehmen(l: Lage): Promise<string> {
    if (l.nutzer === l.besitzer) return 'Der Raum gehört dir schon.';
    const im = drin(l);
    if (!im.includes(l.nutzer)) return 'Übernehmen kann nur, wer im Raum ist.';
    if (im.includes(l.besitzer)) return `Der Besitzer ist im Raum: <@${l.besitzer}>.`;
    return this.neuerBesitzer(l, l.nutzer, grund.uebernehmen, 'Der Raum gehört jetzt dir.', 'Du hast schon einen eigenen Raum.');
  }

  // Jedes Mitglied besitzt höchstens einen Raum je Server. Das prüft nur
  // `UNIQUE (server, besitzer)` (23505), auch bei zwei gleichzeitigen Wechseln.
  // Siehe docs/bot/datenbank.md, „Tabellen“.
  private async neuerBesitzer(l: Lage, neu: string, warum: string, fertig: string, hatRaum: string): Promise<string> {
    try {
      const { rowCount } = await this.k.db.query('UPDATE raeume SET besitzer = $1 WHERE kanal = $2 AND besitzer = $3', [neu, l.raum.id, l.besitzer]);
      if (!rowCount) return 'Der Raum hat inzwischen einen anderen Besitzer.';
    } catch (fehler) {
      if (doppelt(fehler)) return hatRaum;
      throw fehler;
    }
    // Der Besitz gilt schon; scheitern die Rechte, steht nur eine Logzeile da.
    await l.raum
      .setzeRechte(rechte.mitBesitzer(stand(l), neu), warum)
      .catch((fehler: unknown) => console.error(`Sprachraum-Menü: Rechte des Besitzers nicht gesetzt: ${fehlertext(fehler)}`));
    return fertig;
  }

  private info(l: Lage): string {
    const r = stand(l);
    return [
      `Besitzer: <@${l.besitzer}>`,
      `Limit: ${l.raum.limit === 0 ? 'keins' : l.raum.limit}`,
      `Gesperrt: ${ja(rechte.gesperrt(r))}`,
      `Versteckt: ${ja(rechte.versteckt(r))}`,
      `Gebannt: ${rechte.gebannt(r).length}`,
    ].join('\n');
  }
}
