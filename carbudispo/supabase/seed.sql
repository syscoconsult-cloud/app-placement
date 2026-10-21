-- ════════════════════════════════════════════════════════════
--  CarbuDispo — stations de TEST (positions approximatives)
--  À lancer après schema.sql. À remplacer par les vraies stations
--  (Table Editor → stations) avant l'ouverture au public.
-- ════════════════════════════════════════════════════════════
insert into public.stations (nom, quartier, lat, lng, produits, verifiee) values
  ('Station test Cadjèhoun',      'Cadjèhoun',    6.3585, 2.3870, '{essence,gasoil}',     true),
  ('Station test Haie Vive',      'Haie Vive',    6.3530, 2.3955, '{essence,gasoil,gaz}', false),
  ('Station test Ganhi',          'Ganhi',        6.3555, 2.4310, '{essence,gasoil}',     false),
  ('Station test Saint-Michel',   'Saint-Michel', 6.3700, 2.4195, '{essence,gasoil}',     false),
  ('Dépôt de gaz test Fidjrossè', 'Fidjrossè',    6.3610, 2.3520, '{gaz}',                false),
  ('Station test Akpakpa',        'Akpakpa',      6.3660, 2.4520, '{essence,gasoil}',     false);
