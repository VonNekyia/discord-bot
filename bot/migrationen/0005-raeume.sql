-- Räume, die der Bot angelegt hat, und wem sie gehören. Jedes Mitglied
-- besitzt höchstens einen Raum je Server.
-- Siehe docs/benutzung/sprachraeume.md, „Ablauf“.
CREATE TABLE raeume (
  kanal bigint PRIMARY KEY,
  server bigint NOT NULL,
  besitzer bigint NOT NULL,
  angelegt timestamptz NOT NULL DEFAULT now(),
  UNIQUE (server, besitzer)
);
