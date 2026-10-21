-- Managed Commands: Einstellungen je Server, Bans und Kicks für das Limit,
-- Verwarnungen. Siehe docs/schnittstelle/strafen.md, „Typen“, und
-- docs/bot/datenschutz.md, „Was der Bot speichert“.
CREATE TABLE strafen (
  server bigint PRIMARY KEY,
  gruende jsonb NOT NULL,
  limits jsonb NOT NULL,
  dm boolean NOT NULL,
  dm_text text NOT NULL,
  entbannung text NOT NULL,
  verwarnung_tage integer NOT NULL
);

-- Nur wer, was und wann; nicht Ziel und Grund. 7 Tage.
CREATE TABLE strafaktionen (
  server bigint NOT NULL,
  moderator bigint NOT NULL,
  art text NOT NULL CHECK (art IN ('ban', 'kick')),
  zeit timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX strafaktionen_limit ON strafaktionen (server, moderator, art, zeit);

-- So lange, wie der Server in verwarnung_tage einstellt.
CREATE TABLE verwarnungen (
  server bigint NOT NULL,
  ziel bigint NOT NULL,
  moderator bigint NOT NULL,
  grund text NOT NULL,
  zeit timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX verwarnungen_ziel ON verwarnungen (server, ziel, zeit);
