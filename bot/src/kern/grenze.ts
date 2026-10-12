// Zählt Anfragen je Schlüssel in einem gleitenden Fenster von einer Minute.
// Siehe docs/schnittstelle/api.md, „Grenzen je Sitzung“.
export class Grenze {
  private readonly zeiten = new Map<string, number[]>();

  constructor(
    private readonly hoechstens: number,
    private readonly fenster = 60_000,
    private readonly uhr = () => Date.now(),
    // Wenn die Grenze greift; für die Zählung.
    private readonly griff?: () => void,
  ) {}

  // 0, wenn die Anfrage zählt; sonst die Sekunden, bis wieder eine geht.
  pruefe(schluessel: string): number {
    const jetzt = this.uhr();
    const liste = (this.zeiten.get(schluessel) ?? []).filter((zeit) => zeit > jetzt - this.fenster);
    this.zeiten.set(schluessel, liste);
    const aelteste = liste[0];
    if (aelteste !== undefined && liste.length >= this.hoechstens) {
      this.griff?.();
      return Math.ceil((aelteste + this.fenster - jetzt) / 1000);
    }
    liste.push(jetzt);
    return 0;
  }

  // Vergisst Schlüssel ohne Anfrage im Fenster.
  raeume(): void {
    const grenze = this.uhr() - this.fenster;
    for (const [schluessel, liste] of this.zeiten) if ((liste.at(-1) ?? 0) <= grenze) this.zeiten.delete(schluessel);
  }
}
