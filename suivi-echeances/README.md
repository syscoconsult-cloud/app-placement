# Suivi des échéances et rentabilité — cabinet (France / Bénin)

Application web interne, autonome et hébergeable en France, connectée à
Pennylane. Aucune donnée ne transite par Notion ni par un service tiers :
tout est stocké dans une base SQLite sur votre serveur.

## Ce que fait l'application

- **Dossiers** : importés chaque nuit du portefeuille Pennylane (forme,
  clôture, régime et fréquence de TVA, responsable). Les dossiers hors
  Pennylane (Bénin) se créent à la main.
- **Échéances** comptables, fiscales, sociales et juridiques générées selon le
  profil de chaque dossier (moteur `echeances.py`, règles France et Bénin),
  sur 12 mois glissants, avec report au jour ouvré suivant.
- **Mise à jour automatique depuis Pennylane** : une déclaration de TVA ou une
  liasse **acceptée** passe à « Fait » avec sa date de dépôt ; une déclaration
  **rejetée** passe en 🔴 anomalie.
- **Alertes** : 🔴 en retard ou en anomalie, 🟠 sous 7 jours. Chaque matin,
  chaque collaborateur reçoit par e-mail ses échéances à traiter ; les
  administrateurs reçoivent le récapitulatif du cabinet.
- **Temps et rentabilité** : les temps saisis dans Pennylane et les factures du
  cabinet sont importés. Pour un mois (ou en cumul depuis janvier) et par
  dossier : CA, heures, heures non facturables, temps perdu, coût du temps
  (heures × coût horaire du collaborateur), marge, CA par heure, dépassement
  du budget d'heures. CA au choix : factures émises ou honoraires annuels lissés.
- **Accès** : connexion par collaborateur. La rentabilité, les coûts horaires
  et les paramètres sont réservés aux administrateurs.

## Installation

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
cp .env.example .env          # puis compléter
set -a && . ./.env && set +a
.venv/bin/flask --app app creer-admin          # votre compte administrateur
.venv/bin/flask --app app synchroniser         # premier import Pennylane
.venv/bin/flask --app app run                  # http://localhost:5000
```

Tests : `.venv/bin/python -m pytest tests`.

### Hébergement en France

L'image Docker (`Dockerfile`) se déploie sur un hébergeur français, par
exemple Scaleway (Paris), OVHcloud (Roubaix, Gravelines) ou Clever Cloud.
La base est le fichier indiqué par `DATABASE`, à placer sur un volume
persistant sauvegardé (`/donnees`). Les tâches planifiées sont dans
`crontab.exemple` : synchronisation à 2 h, alertes à 7 h 45 les jours ouvrés.
Placez l'application derrière HTTPS.

## Connexion à Pennylane

La connexion directe utilise le jeton API du cabinet (`PENNYLANE_TOKEN`).
Les chemins des services interrogés sont dans `app/pennylane.py`
(`ENDPOINTS_PAR_DEFAUT`) et se surchargent sans toucher au code avec
`PENNYLANE_ENDPOINTS`. **Ils sont à valider avec la documentation de votre
accès API cabinet** : les formats de données, eux, ont été vérifiés sur votre
compte Pennylane.

En attendant, ou pour un import ponctuel, l'écran *Paramètres* accepte un
export JSON au format de Pennylane (exemple : `tests/export_pennylane_exemple.json`).

## Réglages à faire dans l'application

1. **Collaborateurs** : coût horaire de chacun, mot de passe pour ouvrir l'accès.
2. **Paramètres** : activités comptées comme temps perdu, montants de factures
   TTC ou HT, rattachement des clients dont le nom diffère du dossier.
3. **Dossiers** : salariés et effectif, CFE, CVAE, budget d'heures et honoraires
   annuels (non fournis par Pennylane).

## Limites connues

- Seules la TVA (CA3) et la liasse sont mises à jour depuis Pennylane ; les
  autres échéances (DSN, CFE, AG, dépôt des comptes, Bénin) se cochent à la main.
- Bénin : les fêtes musulmanes (dates mobiles) ne sont pas prises en compte
  dans les reports ; la patente n'est pas générée ; la périodicité CNSS et le
  délai de dépôt au RCCM sont à confirmer.
- Les dates légales évoluent avec les lois de finances : relire le référentiel
  (`echeances.py`) chaque année.
