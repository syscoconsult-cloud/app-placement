# CRM Cabinet

CRM pour cabinet d'expertise comptable : suivi des leads, acceptation de la mission,
dossier LCB-FT, déclenchement des automatisations (lettre de mission, signature,
rendez-vous d'onboarding). Données stockées **sur votre ordinateur** dans un seul fichier.

> Pourquoi ces choix, comment fonctionnent les automatisations en local et comment le
> produit pourra être commercialisé : voir [`docs/STRATEGIE.md`](docs/STRATEGIE.md).

## Ce que fait la version actuelle (phase 1)

- **Vue en liste façon Airtable / Notion** : tri par colonne, recherche, filtre par statut,
  colonnes affichables/masquables, regroupement par statut, modification directe dans les
  cellules (statut, mission, source, honoraires, date de relance), relances en retard en rouge.
- **Vue Kanban** : glisser-déposer d'une étape à l'autre.
- **Fiche dossier** en onglets : synthèse (opportunité + entité), personnes (dirigeants,
  bénéficiaires effectifs, PPE), acceptation de la mission, LCB-FT, historique.
- **Acceptation** : indépendance, incompatibilités, compétence, moyens, confrère précédent, décision.
- **LCB-FT** : identification, bénéficiaires effectifs, gel des avoirs, grille de risque
  avec score automatique, niveau de vigilance, date de prochaine revue. Une PPE dans la
  fiche impose la vigilance renforcée.
- **Règle bloquante** : impossible de passer en « Lettre de mission envoyée » (ou au-delà)
  tant que l'acceptation ET le dossier LCB-FT n'ont pas été validés par un admin.
- **Sécurité** : mot de passe (argon2) + double authentification obligatoire, verrouillage
  après 5 échecs, déconnexion après 30 min d'inactivité, rôles admin / collaborateur.
- **Journal d'audit** non modifiable (protégé au niveau de la base de données).
- **Automatisations** : à chaque changement de statut, le CRM envoie un événement à
  Make ou n8n (avec le lien de prise de rendez-vous). File d'attente si Internet est coupé.

## Installation sur votre ordinateur (Mac ou Windows)

1. Installez **Node.js 22 LTS** depuis nodejs.org.
2. Activez le **chiffrement du disque** : FileVault (Mac) ou BitLocker (Windows).
   C'est ce qui protège les données si l'ordinateur est perdu ou volé.
3. Ouvrez un terminal dans le dossier `crm-cabinet`, puis :
   ```bash
   cp .env.example .env          # Windows : copy .env.example .env
   ```
   Ouvrez `.env` et remplacez `SESSION_SECRET` par le résultat de :
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ```
4. Installez et préparez la base :
   ```bash
   npm run installer
   ```
5. Lancez le CRM :
   ```bash
   npm run build
   HTTPS=0 npm start             # Windows (PowerShell) : $env:HTTPS=0; npm start
   ```
6. Ouvrez **http://localhost:3000** : au premier lancement, vous créez votre cabinet et votre
   compte, puis vous scannez le QR code de double authentification.

Pour essayer avec des données fictives : `npm run db:seed` (compte `demo@exemple.fr` /
`demonstration-crm` si aucun compte n'existe encore).

## Sauvegarde

Toutes les données sont dans **`data/crm.db`**. Copiez ce fichier (CRM arrêté) sur un
support chiffré ou un stockage européen, au moins une fois par semaine. Pour restaurer :
remettez le fichier à sa place.

## Brancher Make ou n8n

1. **Paramètres** → collez l'adresse du webhook Make/n8n et votre lien Calendly / Cal.com.
2. Cliquez sur **Générer les clés**.
3. À chaque changement de statut, le CRM envoie (POST JSON) :
   ```json
   {
     "evenement": "dossier.statut_modifie",
     "dossier": { "id": "…", "ancienStatut": "lcbft", "nouveauStatut": "signee", "nouveauStatutLibelle": "Signée", "typeMission": "tenue", "honorairesEstimes": 3600 },
     "entite": { "raisonSociale": "…", "siren": "…" },
     "contact": { "prenom": "…", "nom": "…", "email": "…" },
     "lienRdv": "https://calendly.com/…"
   }
   ```
   L'en-tête `X-CRM-Signature` contient la signature HMAC-SHA256 du corps (secret dans Paramètres).
4. Exemple de scénario Make : *Webhook* → *Routeur* → si `nouveauStatut = signee` →
   e-mail de bienvenue avec `lienRdv` pour réserver la présentation Pennylane.

## Commandes utiles

| Commande | Rôle |
|---|---|
| `npm run dev` | Mode développement |
| `npm test` | Tests automatiques (règles du pipeline, score LCB-FT) |
| `npm run db:seed` | Données fictives |

## Prochaines phases

2. Enrichissement automatique par SIREN + contrôle automatique du gel des avoirs
3. Génération des documents (fiche d'acceptation, fiche LCB-FT, lettre de mission)
4. Signature électronique (Jesignexpert / Yousign)
5. Workflows n8n prêts à importer + Pennylane
6. Temps passé et rentabilité par dossier
