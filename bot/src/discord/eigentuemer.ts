import { Team, TeamMemberMembershipState, type Client } from 'discord.js';

// Wer die Debug-Seite sehen darf: der Eigentümer der Anwendung oder, gehört
// sie einem Team, jedes Mitglied mit angenommener Einladung, in jeder Rolle.
// Die Liste der IDs gilt einmal je Prozess, höchstens `halten` ms; einen
// Fehlschlag hält sie nicht. Siehe docs/schnittstelle/debug.md, „Wer sie sehen darf“.
export class Berechtigte {
  private stand?: { ids: ReadonlySet<string>; bis: number };
  // Gleichzeitige Anfragen teilen sich einen Abruf.
  private laeuft?: Promise<ReadonlySet<string>>;

  constructor(
    private readonly client: Client,
    private readonly uhr = () => Date.now(),
    private readonly halten = 5 * 60_000,
  ) {}

  // Wirft, wenn Discord die Anwendung nicht liefert.
  async darf(nutzer: string): Promise<boolean> {
    return (await this.ids()).has(nutzer);
  }

  private ids(): Promise<ReadonlySet<string>> {
    if (this.stand && this.uhr() < this.stand.bis) return Promise.resolve(this.stand.ids);
    this.laeuft ??= this.lies().finally(() => {
      this.laeuft = undefined;
    });
    return this.laeuft;
  }

  private async lies(): Promise<ReadonlySet<string>> {
    const anwendung = this.client.application;
    if (!anwendung) throw new Error('Anwendung noch unbekannt');
    const { owner } = await anwendung.fetch();
    const ids =
      owner instanceof Team
        ? new Set(owner.members.filter((m) => m.membershipState === TeamMemberMembershipState.Accepted).map((m) => m.id))
        : new Set(owner ? [owner.id] : []);
    this.stand = { ids, bis: this.uhr() + this.halten };
    return ids;
  }
}
