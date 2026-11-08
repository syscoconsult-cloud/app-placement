"""Les deux éditions de l'application : France (connectée à Pennylane) et Bénin.

Chaque édition est déployée séparément, avec sa propre base de données, sa
propre adresse et ses propres comptes. Le choix se fait par la variable
d'environnement EDITION (« france » ou « benin »).
"""

EDITIONS = {
    "france": {
        "code": "france",
        "pays": "France",
        "nom": "Suivi des échéances — France",
        "nom_court": "Échéances France",
        "drapeau": "🇫🇷",
        "monnaie": "€",
        "pennylane": True,          # dossiers, déclarations, temps et factures lus dans Pennylane
        "saisie_manuelle": False,   # temps et factures saisis dans l'application
        "libelle_identifiant": "SIREN",
        "formes": ["SAS", "SASU", "SARL", "EURL", "SCI", "EI", "SA", "SNC", "Association"],
        "regimes_imposition": ["IS", "IR - BIC", "IR - BNC", "IR - revenus fonciers"],
        "regimes_tva": ["Mensuel (CA3)", "Trimestriel (CA3)", "Simplifié (CA12)", "Franchise en base"],
        "jour_tva_defaut": 19,
        "aide_jour_tva": "du 15 au 24 selon le SIE",
        "cases": [("salaries", "Salariés"), ("cfe", "CFE"), ("acompte_cfe", "Acompte CFE (CFE N-1 ≥ 3 000 €)"),
                  ("cvae", "CVAE"), ("depot_comptes", "Dépôt des comptes au greffe")],
    },
    "benin": {
        "code": "benin",
        "pays": "Bénin",
        "nom": "Suivi des échéances — Bénin",
        "nom_court": "Échéances Bénin",
        "drapeau": "🇧🇯",
        "monnaie": "FCFA",
        "pennylane": False,
        "saisie_manuelle": True,
        "libelle_identifiant": "IFU",
        "formes": ["SARL", "SARLU", "SA", "SAS", "SASU", "SNC", "GIE", "EI", "Association"],
        "regimes_imposition": ["IS"],
        "regimes_tva": ["Mensuel (Bénin)", "Non assujetti"],
        "jour_tva_defaut": 10,
        "aide_jour_tva": "10 du mois suivant",
        "cases": [("salaries", "Salariés"), ("depot_comptes", "Dépôt des états financiers au RCCM")],
    },
}


def edition(code):
    try:
        return EDITIONS[(code or "france").lower()]
    except KeyError:
        raise RuntimeError(f"EDITION inconnue : {code!r} (valeurs possibles : {', '.join(EDITIONS)}).") from None
