# Suivi des échéances — cabinet (France / Bénin)

Outil interne de suivi des échéances comptables, fiscales, sociales et
juridiques, consultable mois par mois et dossier par dossier.

- **Données et suivi** : espace Notion « Suivi des échéances — Cabinet »
  - *Dossiers* : profil de chaque client (pays, collaborateur, clôture,
    régimes TVA et d'imposition, salariés et effectif, CFE, CVAE, dépôt des comptes).
  - *Échéances* : une ligne par obligation et par période, avec un statut
    (À faire, En cours, Fait) et une alerte calculée : 🔴 En retard,
    🟠 Sous 7 jours, 🟢 À venir, ✅ Fait.
  - *Référentiel des obligations* : les règles de date appliquées, avec une
    case « À vérifier » pour les règles à faire valider par le cabinet.
- **Moteur de génération** : `echeances.py` calcule les échéances d'un
  dossier à partir de son profil. Les dates tombant un week-end ou un jour
  férié sont reportées au jour ouvré suivant.

## Utilisation

```bash
# Échéances des 12 prochains mois pour une liste de dossiers
python3 echeances.py exemples-dossiers.json --du 2026-09-25 --au 2027-09-30

# Export du référentiel des règles
python3 echeances.py --referentiel
```

Le format d'un dossier est décrit en tête de `echeances.py`.
`exemples-dossiers.json` contient les deux dossiers d'exemple chargés dans Notion.

## Limites connues

- Le jour limite de TVA en France (du 15 au 24) dépend du dossier : il se
  renseigne dans le champ « Jour limite TVA ».
- Bénin : les fêtes musulmanes (dates mobiles) ne sont pas prises en compte
  dans les reports. La patente n'est pas générée automatiquement. La
  périodicité CNSS et le délai de dépôt au RCCM sont à confirmer.
- Les dates légales évoluent avec les lois de finances : le référentiel doit
  être relu chaque année.
