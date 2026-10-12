---
name: pr-reviewen
description: Der Workflow des Orchestrators. Nutzen, wenn ein Auftrag an Backend oder Frontend geht, eine PR fertig gemeldet wird oder eine PR gemergt werden soll.
---

# PR reviewen

## Auftrag verteilen

Vorher: offene Konflikte und PRs von Renovate, die warten (`AGENTS.md`,
Regel 31, Skill [`renovate-pr-bewerten`](../renovate-pr-bewerten/SKILL.md)).

1. **Zerlegen.** Ein Auftrag betrifft eine Seite: `bot/` an den
   Backend-Developer, `web/` an den Frontend-Developer. Braucht er beide,
   zuerst die Schnittstelle in `docs/` festlegen, dann zwei Aufträge.
2. **Auftrag schreiben.** Ziel in einem Satz, die Seiten in `docs/`, die
   gelten, was fertig heisst (Test, Doku, Check), Branch-Name. Für das
   Frontend dazu die Elemente des Design-Guides, die gebraucht werden.
3. **Eine PR je Auftrag**, gegen `main`.

## Review

1. **Stand prüfen.** `gh pr view <nr> --json baseRefName,headRefOid,mergeable`
   und `gh pr checks <nr>`. Basis ist `main`, alle Checks grün.
2. **Diff lesen**, ganz: `gh pr diff <nr>`.
3. **Prüfliste** unten durchgehen.
4. **Antwort** als Kommentar an der PR, zuerst die Tabelle, dann
   Einzelheiten je Befund:

   ```markdown
   | # | Befund | Commit | Test |
   |---|---|---|---|
   | 1 | Intent `GuildMembers` ohne Begründung in docs/bot/intents.md | – | – |
   ```

   `Commit` und `Test` füllt der Developer, wenn er den Befund behebt.
5. **Nachprüfen**, bis die Tabelle leer ist oder jede Zeile Commit und
   Test hat.

## Mergen

Nur wenn alles stimmt:

```bash
gh pr view <nr> --json mergeable,baseRefName,headRefOid
gh api repos/VonNekyia/discord-bot/compare/main...<kopf> --jq .behind_by
gh pr merge <nr> --merge --match-head-commit <kopf>
```

- `mergeable` ist `MERGEABLE`, Basis `main`, `behind_by` ist 0, mindestens
  ein Check und alle grün.
- `--match-head-commit` mit dem Kopf, der reviewt wurde. Ist ein neuer
  Commit dazugekommen, erst ihn reviewen.
- Danach jede offene PR, die jetzt hinten liegt, zum Rebase zurück an
  ihren Developer.

## Prüfliste

- [ ] Doku im selben PR; Skill `doku-pflegen`, Prüfliste dort.
- [ ] Neue Richtung oder Abhängigkeit hat eine Entscheidung, Regel 23.
- [ ] Jeder Intent und jedes Recht begründet, Regel 24.
- [ ] Gespeicherte Discord-Daten stehen auf der Datenschutzseite; nichts
      Personenbezogenes im Log.
- [ ] Fehler der Discord-API behandelt und getestet: 429, 5xx,
      Verbindungsabbruch.
- [ ] Tests ehrlich: Mindestens einer fällt, wenn die Änderung fehlt.
- [ ] Frontend: jedes Element wie im Design-Guide, nur Tokens, keine
      erfundenen Werte.
- [ ] Keine Secrets, keine IDs, keine Interna, Regeln 20 und 21.
- [ ] Keine Quelle für Ideen genannt, Regel 26.
- [ ] PR von Renovate: Skill
      [`renovate-pr-bewerten`](../renovate-pr-bewerten/SKILL.md).
