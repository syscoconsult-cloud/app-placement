# Mise en ligne sans maintenance (Clever Cloud)

Clever Cloud est un hébergeur français (centres de données à Paris) qui gère
tout le technique : serveurs, mises à jour de sécurité, certificat HTTPS,
redémarrage en cas de panne et **sauvegardes quotidiennes automatiques de la
base de données**. Vous n'avez ni serveur à administrer ni sauvegarde à lancer.

Chaque application (France, Bénin) se compose de deux éléments chez Clever
Cloud : une **application Python** et une **base PostgreSQL** qui lui est reliée.

## Étapes (à faire une fois par application)

1. **Compte** : créez une organisation au nom du cabinet sur clever-cloud.com
   et ajoutez un moyen de paiement.
2. **Application** : *Créer > Application > Python*, depuis le dépôt GitHub
   `app-placement` (branche principale), région **Paris**. Nom :
   `echeances-france` (puis `echeances-benin`).
3. **Base de données** : *Créer > Add-on > PostgreSQL*, région **Paris**,
   reliée à l'application. Choisissez une offre qui inclut les sauvegardes
   automatiques et vérifiez leur durée de conservation.
4. **Variables d'environnement** de l'application :

   | Variable | France | Bénin |
   |---|---|---|
   | `APP_FOLDER` | `suivi-echeances` | `suivi-echeances` |
   | `CC_PYTHON_MODULE` | `wsgi:application` | `wsgi:application` |
   | `CC_PYTHON_BACKEND` | `gunicorn` | `gunicorn` |
   | `EDITION` | `france` | `benin` |
   | `SECRET_KEY` | longue chaîne aléatoire | **une autre** chaîne aléatoire |
   | `URL_APPLICATION` | `https://echeances-france.votre-cabinet.fr` | `https://echeances-benin.votre-cabinet.fr` |
   | `ADMIN_EMAIL`, `ADMIN_NOM`, `ADMIN_MOT_DE_PASSE` | votre compte (12 caractères minimum) | idem |
   | `SMTP_HOTE`, `SMTP_PORT`, `SMTP_UTILISATEUR`, `SMTP_MOT_DE_PASSE`, `SMTP_EXPEDITEUR` | serveur d'envoi d'e-mails | idem |
   | `PENNYLANE_TOKEN`, `PENNYLANE_FIRM_ID`, `PENNYLANE_OWN_COMPANY_ID` | jeton et identifiants du cabinet | — |

   L'adresse de la base est fournie automatiquement par Clever Cloud
   (`POSTGRESQL_ADDON_URI`) : rien à recopier.
5. **Nom de domaine** : ajoutez `echeances-france.votre-cabinet.fr` dans
   l'onglet *Noms de domaine* et créez chez votre registraire l'enregistrement
   DNS indiqué. Le certificat HTTPS est créé et renouvelé automatiquement.
6. **Premier accès** : connectez-vous avec `ADMIN_EMAIL` et
   `ADMIN_MOT_DE_PASSE`, puis **supprimez la variable `ADMIN_MOT_DE_PASSE`**
   dans Clever Cloud. Le compte reste actif ; changez le mot de passe dans
   l'écran *Collaborateurs*.

## Ce qui tourne tout seul

- Tâches planifiées (`clevercloud/cron.json`, heures UTC) : synchronisation
  Pennylane chaque nuit à 1 h UTC (France ; ignorée par l'édition Bénin), alertes à
  6 h 45 UTC les jours ouvrés (7 h 45 à Paris l'hiver, 8 h 45 l'été ; 7 h 45 à Cotonou).
- Si la synchronisation Pennylane échoue, les administrateurs reçoivent un
  e-mail ; le détail est dans *Paramètres > Dernières synchronisations*.
- Clever Cloud applique les mises à jour du système et de Python à chaque
  redéploiement, et sauvegarde la base chaque jour.

Lors de la première mise en ligne, vérifiez dans les journaux Clever Cloud que
les deux tâches planifiées s'exécutent bien (le format des tâches et le nom des
variables Clever Cloud ci-dessus sont à confirmer avec leur documentation du moment).

## Ce qui reste à votre charge

- Rien de technique au quotidien.
- Une fois par an : mise à jour des dates légales (`echeances.py`) après la loi
  de finances, par Claude ou un développeur ; la mise en ligne se fait en
  publiant la modification sur GitHub.
- Côté RGPD : registre des traitements, accord de traitement des données avec
  Clever Cloud, information des collaborateurs sur le suivi des temps. Pour le
  Bénin, vérifier auprès de l'APDP les conditions d'hébergement hors du pays.

## Autre hébergeur

L'application fonctionne aussi chez tout hébergeur capable de lancer une image
Docker (`Dockerfile`) avec une base PostgreSQL gérée (OVHcloud Managed
Databases, Scalingo…). Sans base PostgreSQL, elle utilise un fichier SQLite :
il faut alors en assurer soi-même la sauvegarde.
