-- Einstellungen der Sprachräume je Server; `erzeuger` ist die Liste aus der
-- API. Siehe docs/schnittstelle/sprachraeume.md, „Typen“.
CREATE TABLE sprachraeume (
  server bigint PRIMARY KEY,
  an boolean NOT NULL,
  erzeuger jsonb NOT NULL
);
