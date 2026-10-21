# CarbuDispo — version de test

Application web (installable sur le téléphone) qui montre où trouver de
l'essence, du gasoil et du gaz au Bénin, avec signalements des usagers
façon Waze et un espace vendeur.

**Confidentialité dès la conception** : la position GPS reste sur le
téléphone. Un signalement envoie seulement la station, le produit, le
statut, l'heure et un identifiant anonyme aléatoire.

---

## Ce que contient ce dossier

| Fichier | Rôle |
|---|---|
| `index.html`, `styles.css`, `app.js` | L'application |
| `supabase-config.js` | **Le seul fichier à modifier** : adresse et clé de votre base |
| `supabase/schema.sql` | Crée les tables, les règles d'accès et le nettoyage automatique |
| `supabase/seed.sql` | 6 stations de test à Cotonou |
| `confidentialite.html` | Politique de confidentialité (à compléter : [NOM], [EMAIL]…) |
| `manifest.json`, `sw.js`, `icon.svg` | Installation sur l'écran d'accueil |

Sans configuration, l'application tourne en **mode démo** : stations
fictives, données gardées sur le téléphone. Pratique pour un premier essai.

---

## Étape 1 — Créer la base Supabase (10 min)

1. Créer un compte sur [supabase.com](https://supabase.com), puis **New project**.
2. **Region : West EU (Paris)** — ou Central EU (Frankfurt). C'est ce choix
   qui place les données en Europe (dossier APDP).
3. Choisir un mot de passe de base solide et le garder en lieu sûr.
4. Une fois le projet prêt : **SQL Editor → New query**, coller tout le
   contenu de `supabase/schema.sql`, cliquer **Run**.
   - Si seule la dernière partie (pg_cron) échoue : **Database → Extensions**,
     activer `pg_cron`, puis relancer uniquement le dernier bloc du fichier.
5. Nouvelle requête : coller `supabase/seed.sql`, **Run** (stations de test).

## Étape 2 — Brancher l'application (2 min)

1. Dans Supabase : **Project Settings → API**. Copier **Project URL** et la
   clé **anon public** (jamais la clé `service_role`).
2. Sur GitHub, ouvrir `carbudispo/supabase-config.js`, cliquer sur le crayon
   (Edit), coller les deux valeurs, puis **Commit changes**.

## Étape 3 — Mettre en ligne sur Netlify (5 min)

1. [app.netlify.com](https://app.netlify.com) → **Add new site → Import an existing project → GitHub**.
2. Choisir ce dépôt et la branche.
3. **Base directory : `carbudispo`** — laisser le reste vide.
4. **Deploy**. Netlify donne une adresse du type `https://xxx.netlify.app`.
   Chaque modification sur GitHub redéploie automatiquement.

L'adresse en `https://` est indispensable : sans elle, le téléphone refuse
la localisation.

## Étape 4 — Créer un compte vendeur de test

1. Supabase → **Authentication → Users → Add user → Create new user** :
   email + mot de passe, cocher **Auto Confirm User**.
2. **SQL Editor**, remplacer l'email puis lancer :

```sql
insert into public.vendeurs (user_id, station_id)
select u.id, s.id
from auth.users u, public.stations s
where u.email = 'vendeur@exemple.bj'
  and s.nom = 'Station test Cadjèhoun';
```

Le vendeur se connecte ensuite dans l'onglet **Espace vendeur**.

## Étape 5 — Ajouter les vraies stations

Supabase → **Table Editor → stations → Insert row** : nom, quartier, `lat`,
`lng` (clic droit sur Google Maps → les coordonnées s'affichent),
produits (`{essence,gasoil}`, `{gaz}`…), `verifiee`.
Supprimer les stations « test » avant l'ouverture au public.

---

## Checklist de test

- [ ] Ouvrir le lien sur un téléphone Android et un iPhone, accepter la localisation
- [ ] Refuser la localisation : le choix du quartier doit fonctionner
- [ ] Changer de produit (Essence / Gasoil / Gaz) : carte et liste se mettent à jour
- [ ] Ouvrir une fiche, suivre l'itinéraire
- [ ] Signaler un statut ; refaire le même signalement tout de suite → refus (anti-abus)
- [ ] Depuis un 2ᵉ téléphone, vérifier que le signalement apparaît (rafraîchissement : 1 min)
- [ ] Vendeur : changer un statut, publier une annonce, vérifier côté consommateur
- [ ] 2 téléphones signalent le contraire du vendeur → leur statut l'emporte
- [ ] Alertes : suivre un quartier, mettre une station en favori, rouvrir l'appli après un changement
- [ ] « Supprimer mes données » puis vérifier dans Supabase (table `signalements`)
- [ ] Ajouter à l'écran d'accueil (Android : menu ⋮ → Installer ; iPhone : Partager → Sur l'écran d'accueil)

## Avant le lancement public

- Passer `TEST_MODE: false` dans `supabase-config.js` (règle des 300 m bloquante).
- Compléter `confidentialite.html` et obtenir le récépissé APDP.
- Remplacer les stations de test par les vraies.

## Limites de cette version de test

- **Notifications** : les alertes s'affichent à l'ouverture de l'appli. Les
  notifications sur écran verrouillé (Firebase Cloud Messaging) sont l'étape
  suivante.
- **Rayon des annonces** : les annonces vont aux usagers qui suivent le
  quartier ou la station ; le rayon en km sera utilisé avec les notifications push.
- **Paiement des abonnements** (Mobile Money) : non inclus.
- La vérification des 300 m se fait sur le téléphone ; l'anti-abus côté base
  (10 signalements/heure, pas de doublon en 10 min, poids des confirmations)
  limite les fraudes.
