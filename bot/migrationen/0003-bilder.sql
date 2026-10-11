-- Hintergründe der Banner, je Server und Art: 1100 × 440 px als WebP,
-- ohne Metadaten. Siehe docs/bot/dashboard-api.md, „Bilder“.
CREATE TABLE bilder (
  server bigint NOT NULL,
  art text NOT NULL CHECK (art IN ('beitritt', 'abschied')),
  daten bytea NOT NULL,
  PRIMARY KEY (server, art)
);
