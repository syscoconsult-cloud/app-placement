# Onboarding cabinet

Outil local (Windows) pour l'onboarding des clients du cabinet :
CRM prospects/clients → prise de connaissance → LAB-FT → acceptation de mission → lettre de mission.

## Où sont les données ?

L'application tourne **sur votre ordinateur** (elle n'est accessible que depuis celui-ci).
Toutes les données sont rangées dans votre **OneDrive**, donc chez Microsoft, comme le reste du cabinet :

```
OneDrive\Cabinet - Onboarding\
 ├── Base\               → base clients et questionnaires (ne pas partager)
 ├── Pieces clients\     → CNI, statuts, Kbis (ne pas partager)
 └── Lettres de mission\ → lettres générées (peut être partagé avec l'assistante)
```

Seul le **numéro SIREN** part vers l'extérieur, pour interroger l'API publique de l'État
(recherche-entreprises.api.gouv.fr). Aucune donnée client n'est envoyée.

⚠️ N'ouvrez l'outil que sur **un ordinateur à la fois** : la base est un fichier unique synchronisé par OneDrive.

## Installation (une seule fois)

1. Installez **Python** depuis https://www.python.org/downloads/ (cochez « Add python.exe to PATH »).
2. Copiez le dossier `onboarding-cabinet` sur votre ordinateur (pas dans OneDrive).

## Utilisation

Double-cliquez sur **`lancer.bat`**. Le navigateur s'ouvre sur l'outil.
Fermez la fenêtre noire pour l'arrêter.

## Modifier les questions

Les questions sont dans `questionnaires\prise_de_connaissance.json`. Vous pouvez les modifier sans toucher au code.
Types possibles : `texte`, `texte_long`, `nombre`, `date`, `oui_non`, `choix`, `choix_multiple`.

## Feuille de route

- [x] CRM : fiches prospects/clients, recherche, statuts, historique des échanges
- [x] Remplissage automatique depuis le SIREN (dénomination, forme, siège, NAF, dirigeants)
- [x] Questionnaire de prise de connaissance (questions d'exemple, à remplacer)
- [ ] Questionnaire LAB-FT avec calcul du niveau de risque
- [ ] Questionnaire d'acceptation de mission
- [ ] Génération des lettres de mission (Word / PDF) dans `Lettres de mission\`
- [ ] Rangement des pièces clients (CNI, statuts, Kbis)
- [ ] Version « installable » (.exe) sans Python

## Développement

```
py -3 -m venv .venv && .venv\Scripts\activate && pip install -r requirements.txt
python manage.py test
```
