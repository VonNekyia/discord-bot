-- Je Einmalkauf, an welchen Server er gebunden ist. Ein Kauf bindet nur
-- einen Server, ein Server je SKU nur einen Kauf. Bleibt, wenn der Bot den
-- Server verlässt. Siehe docs/entscheidungen/0020-bezahlte-module.md.
CREATE TABLE bindungen (
  entitlement bigint PRIMARY KEY,
  server bigint NOT NULL,
  sku bigint NOT NULL,
  -- Hat Discord den Kauf als verbraucht angenommen?
  verbraucht boolean NOT NULL DEFAULT false,
  zeit timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bindungen_einmal UNIQUE (server, sku)
);
