-- Einstellungen für Beitritt und Abschied, je Server und Art.
-- Siehe docs/benutzung/begruessung.md.
CREATE TABLE begruessungen (
  server bigint NOT NULL,
  art text NOT NULL CHECK (art IN ('beitritt', 'abschied')),
  an boolean NOT NULL,
  kanal bigint,
  text text NOT NULL,
  banner boolean NOT NULL,
  banner_text text NOT NULL,
  PRIMARY KEY (server, art)
);
