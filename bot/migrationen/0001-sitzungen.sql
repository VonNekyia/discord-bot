-- Sitzungen des Dashboards. Siehe docs/schnittstelle/anmeldung.md, „Sitzung“.
CREATE TABLE sitzungen (
  kennung bytea PRIMARY KEY CHECK (length(kennung) = 32),
  nutzer bigint NOT NULL,
  name text NOT NULL,
  avatar text,
  server bigint[] NOT NULL,
  ablauf timestamptz NOT NULL
);

CREATE INDEX sitzungen_ablauf ON sitzungen (ablauf);
