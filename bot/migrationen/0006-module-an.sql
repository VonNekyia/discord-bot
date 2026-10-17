-- Je Server und Modul, ob es an ist; ohne Zeile gilt der Standard des
-- Moduls. Siehe docs/schnittstelle/module.md, „Welche Module“.
CREATE TABLE module_an (
  server bigint NOT NULL,
  modul text NOT NULL,
  an boolean NOT NULL,
  PRIMARY KEY (server, modul)
);
