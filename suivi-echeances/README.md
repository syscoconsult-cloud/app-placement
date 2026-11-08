# Suivi des échéances et rentabilité — cabinet (France / Bénin)

Deux applications web internes et autonomes, construites sur le même code :

| | Application France | Application Bénin |
|---|---|---|
| Réglage | `EDITION=france` | `EDITION=benin` |
| Dossiers | importés de Pennylane chaque nuit | créés dans l'application |
| Statut des déclarations | TVA et liasse lues dans Pennylane | coché par le collaborateur |
| Temps et honoraires | importés de Pennylane | saisis dans l'application |
| Monnaie | € | FCFA |
| Règles d'échéances | France | Bénin (OHADA, DGI, CNSS) |

Chaque application a **son serveur, sa base de données, son adresse et ses
comptes** : aucune donnée n'est partagée entre elles, et aucune ne transite par
Notion ni par un service tiers. Une correction du code ou des règles profite
aux deux à leur prochain déploiement.

## Ce que fait l'application

- **Dossiers** : en France, importés chaque nuit du portefeuille Pennylane
  (forme, clôture, régime et fréquence de TVA, responsable) ; au Bénin, créés
  dans l'application. Le suivi d'un dossier démarre à son entrée dans l'outil.
- **Échéances** comptables, fiscales, sociales et juridiques générées selon le
  profil de chaque dossier (moteur `echeances.py`, règles France et Bénin),
  sur 12 mois glissants, avec report au jour ouvré suivant.
- **Mise à jour automatique depuis Pennylane** (France) : une déclaration de TVA ou une
  liasse **acceptée** passe à « Fait » avec sa date de dépôt ; une déclaration
  **rejetée** passe en 🔴 anomalie.
- **Alertes** : 🔴 en retard ou en anomalie, 🟠 sous 7 jours. Chaque matin,
  chaque collaborateur reçoit par e-mail ses échéances à traiter ; les
  administrateurs reçoivent le récapitulatif du cabinet.
- **Temps et rentabilité** : en France, les temps saisis dans Pennylane et les
  factures du cabinet sont importés ; au Bénin, chaque collaborateur saisit ses
  temps (écran *Saisie des temps*) et l'administrateur les honoraires facturés
  (écran *Honoraires*). Pour un mois (ou en cumul depuis janvier) et par
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

Pour essayer l'application Bénin en local : `EDITION=benin` dans `.env`, puis
`creer-admin` et `run` (pas de synchronisation).

### Hébergement

La même image Docker (`Dockerfile`) est déployée deux fois, une par
application, chacune avec sa variable `EDITION`, sa clé `SECRET_KEY`, son volume
de données et son adresse (par exemple `echeances-france.votre-cabinet.fr` et
`echeances-benin.votre-cabinet.fr`). Hébergeurs en France : Scaleway (Paris),
OVHcloud (Roubaix, Gravelines) ou Clever Cloud. L'application Bénin peut être
hébergée au même endroit ou ailleurs selon vos obligations de protection des
données.

La base est le fichier indiqué par `DATABASE`, à placer sur un volume
persistant sauvegardé (`/donnees`). Les tâches planifiées sont dans
`crontab.exemple`. Placez chaque application derrière HTTPS.

## Connexion à Pennylane (application France)

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
2. **Paramètres** : activités comptées comme temps perdu (et, au Bénin,
   ajout d'activités de saisie) ; en France, montants de factures TTC ou HT et
   rattachement des clients dont le nom diffère du dossier.
3. **Dossiers** : salariés et effectif, CFE, CVAE, budget d'heures et honoraires
   annuels (non fournis par Pennylane).

## Limites connues

- France : seules la TVA (CA3) et la liasse sont mises à jour depuis Pennylane ;
  les autres échéances (DSN, CFE, AG, dépôt des comptes) se cochent à la main.
- Bénin : tous les statuts se cochent à la main (pas de connexion aux
  e-services de la DGI).
- Bénin : les fêtes musulmanes (dates mobiles) ne sont pas prises en compte
  dans les reports ; la patente n'est pas générée ; la périodicité CNSS et le
  délai de dépôt au RCCM sont à confirmer.
- Les dates légales évoluent avec les lois de finances : relire le référentiel
  (`echeances.py`) chaque année.
