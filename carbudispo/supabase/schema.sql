-- ════════════════════════════════════════════════════════════
--  CarbuDispo — schéma de la base Supabase
--  À coller dans Supabase → SQL Editor → New query → Run
--
--  Confidentialité : aucune table ne contient de position
--  d'utilisateur. Les consommateurs sont représentés par un
--  identifiant anonyme aléatoire (device_id).
-- ════════════════════════════════════════════════════════════

-- ── Points de vente ──────────────────────────────────────────
create table public.stations (
  id         uuid primary key default gen_random_uuid(),
  nom        text not null,
  quartier   text not null,
  ville      text not null default 'Cotonou',
  lat        double precision not null,
  lng        double precision not null,
  produits   text[] not null default '{essence,gasoil}',
  verifiee   boolean not null default false,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  constraint produits_valides check (produits <@ array['essence','gasoil','gaz'] and cardinality(produits) > 0)
);

-- ── Comptes vendeurs : un utilisateur Supabase Auth ↔ une station
create table public.vendeurs (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  station_id uuid not null references public.stations(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ── Statut publié par le vendeur (une ligne par station et produit)
create table public.statuts_vendeur (
  station_id uuid not null references public.stations(id) on delete cascade,
  produit    text not null check (produit in ('essence','gasoil','gaz')),
  statut     text not null check (statut in ('ok','queue','out')),
  updated_at timestamptz not null default now(),
  primary key (station_id, produit)
);

-- ── Signalements des consommateurs (sans position, sans nom)
create table public.signalements (
  id         bigint generated always as identity primary key,
  station_id uuid not null references public.stations(id) on delete cascade,
  produit    text not null check (produit in ('essence','gasoil','gaz')),
  statut     text not null check (statut in ('ok','queue','out')),
  attente    text check (attente in ('courte','moyenne','longue')),
  device_id  uuid not null,
  created_at timestamptz not null default now()
);
create index signalements_recents_idx on public.signalements (created_at desc);
create index signalements_device_idx  on public.signalements (device_id, created_at desc);

-- ── Annonces des vendeurs (livraison reçue…)
create table public.annonces (
  id         bigint generated always as identity primary key,
  station_id uuid not null references public.stations(id) on delete cascade,
  produit    text check (produit in ('essence','gasoil','gaz')),
  message    text not null check (char_length(message) between 3 and 200),
  rayon_km   int  not null default 3 check (rayon_km between 1 and 10),
  created_at timestamptz not null default now()
);

-- ── Préférences d'alertes (quartiers suivis, pas de position)
create table public.abonnements (
  device_id  uuid primary key,
  quartiers  text[] not null default '{}',
  favoris    uuid[] not null default '{}',
  alertes    jsonb  not null default '{}',
  push_token text,
  updated_at timestamptz not null default now()
);

-- ════════════════════════════════════════════════════════════
--  RÈGLES D'ACCÈS (Row Level Security)
-- ════════════════════════════════════════════════════════════
alter table public.stations        enable row level security;
alter table public.vendeurs        enable row level security;
alter table public.statuts_vendeur enable row level security;
alter table public.signalements    enable row level security;
alter table public.annonces        enable row level security;
alter table public.abonnements     enable row level security;

-- Tout le monde voit les stations actives ; seule l'équipe (tableau de bord) les modifie
create policy "stations visibles" on public.stations
  for select to anon, authenticated using (active);

-- Un vendeur voit uniquement son propre rattachement
create policy "mon rattachement" on public.vendeurs
  for select to authenticated using (user_id = auth.uid());

-- Statuts vendeur : lecture publique, écriture par le vendeur de la station
create policy "statuts visibles" on public.statuts_vendeur
  for select to anon, authenticated using (true);
create policy "vendeur ajoute son statut" on public.statuts_vendeur
  for insert to authenticated
  with check (exists (select 1 from public.vendeurs v where v.user_id = auth.uid() and v.station_id = statuts_vendeur.station_id));
create policy "vendeur modifie son statut" on public.statuts_vendeur
  for update to authenticated
  using (exists (select 1 from public.vendeurs v where v.user_id = auth.uid() and v.station_id = statuts_vendeur.station_id))
  with check (exists (select 1 from public.vendeurs v where v.user_id = auth.uid() and v.station_id = statuts_vendeur.station_id));

-- Signalements : tout le monde peut en ajouter ; personne ne lit la table brute
-- (la lecture passe par la vue signalements_recents, sans device_id)
create policy "ajouter un signalement" on public.signalements
  for insert to anon, authenticated with check (true);

-- Annonces : visibles 24 h ; publiées par le vendeur de la station
create policy "annonces recentes visibles" on public.annonces
  for select to anon, authenticated using (created_at > now() - interval '24 hours');
create policy "vendeur publie une annonce" on public.annonces
  for insert to authenticated
  with check (exists (select 1 from public.vendeurs v where v.user_id = auth.uid() and v.station_id = annonces.station_id));

-- abonnements : aucune politique → accessible seulement via les fonctions ci-dessous

-- ════════════════════════════════════════════════════════════
--  VUE PUBLIQUE DES SIGNALEMENTS (6 dernières heures, sans device_id)
-- ════════════════════════════════════════════════════════════
create view public.signalements_recents as
  select station_id, produit, statut, attente, created_at
  from public.signalements
  where created_at > now() - interval '6 hours';
grant select on public.signalements_recents to anon, authenticated;

-- ════════════════════════════════════════════════════════════
--  ANTI-ABUS : contrôles à chaque signalement
-- ════════════════════════════════════════════════════════════
create function public.verifier_signalement() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.created_at := now();
  if new.statut <> 'queue' then new.attente := null; end if;

  if not exists (select 1 from stations s
                 where s.id = new.station_id and s.active and new.produit = any(s.produits)) then
    raise exception 'Ce produit n''est pas vendu par cette station';
  end if;

  if (select count(*) from signalements
      where device_id = new.device_id and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'Trop de signalements en une heure. Réessayez plus tard.';
  end if;

  if exists (select 1 from signalements
             where device_id = new.device_id and station_id = new.station_id
               and produit = new.produit and created_at > now() - interval '10 minutes') then
    raise exception 'Vous avez déjà signalé ce produit ici il y a moins de 10 minutes.';
  end if;

  return new;
end $$;

create trigger signalement_controle
  before insert on public.signalements
  for each row execute function public.verifier_signalement();

-- ════════════════════════════════════════════════════════════
--  FONCTIONS APPELÉES PAR L'APPLICATION (sans compte)
-- ════════════════════════════════════════════════════════════
create function public.enregistrer_abonnement(
  p_device uuid, p_quartiers text[], p_favoris uuid[], p_alertes jsonb
) returns void
language sql security definer set search_path = public as $$
  insert into abonnements (device_id, quartiers, favoris, alertes, updated_at)
  values (p_device, coalesce(p_quartiers[1:50], '{}'), coalesce(p_favoris[1:50], '{}'), coalesce(p_alertes, '{}'), now())
  on conflict (device_id) do update
    set quartiers = excluded.quartiers, favoris = excluded.favoris,
        alertes = excluded.alertes, updated_at = now();
$$;

create function public.supprimer_mes_donnees(p_device uuid) returns void
language sql security definer set search_path = public as $$
  delete from signalements where device_id = p_device;
  delete from abonnements  where device_id = p_device;
$$;

revoke all on function public.enregistrer_abonnement(uuid, text[], uuid[], jsonb) from public;
revoke all on function public.supprimer_mes_donnees(uuid) from public;
grant execute on function public.enregistrer_abonnement(uuid, text[], uuid[], jsonb) to anon, authenticated;
grant execute on function public.supprimer_mes_donnees(uuid) to anon, authenticated;

-- ════════════════════════════════════════════════════════════
--  NETTOYAGE AUTOMATIQUE (durées annoncées à l'APDP)
--  Si cette partie échoue : Database → Extensions → activer pg_cron,
--  puis relancer uniquement ce bloc.
-- ════════════════════════════════════════════════════════════
create extension if not exists pg_cron;

select cron.schedule('carbudispo-purge', '15 3 * * *', $$
  delete from public.signalements where created_at < now() - interval '30 days';
  delete from public.annonces     where created_at < now() - interval '30 days';
  delete from public.abonnements  where updated_at < now() - interval '12 months';
$$);
