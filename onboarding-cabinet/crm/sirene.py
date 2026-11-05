"""
Récupération des informations d'une entreprise à partir de son SIREN, via
l'API publique et gratuite de l'État : https://recherche-entreprises.api.gouv.fr

Seul le numéro SIREN est envoyé (donnée publique), jamais d'informations
sur vos clients.

Note : le capital social n'est pas fourni par cette API (il figure au RNE /
dans les statuts) : il reste à saisir à la main.
"""

import json
import urllib.error
import urllib.request

URL = "https://recherche-entreprises.api.gouv.fr/search?q={siren}&page=1&per_page=1"

# Principales catégories juridiques INSEE (les autres affichent le code).
FORMES_JURIDIQUES = {
    "1000": "Entrepreneur individuel",
    "5410": "SARL nationale",
    "5422": "SARL immobilière de gestion",
    "5426": "SARL immobilière",
    "5498": "EURL",
    "5499": "SARL",
    "5505": "SA à participation ouvrière à conseil d'administration",
    "5599": "SA à conseil d'administration",
    "5699": "SA à directoire",
    "5710": "SAS",
    "5720": "SASU",
    "6540": "SCI de construction-vente",
    "6541": "SCI",
    "6599": "Société civile",
    "6585": "Société civile de moyens",
    "9220": "Association déclarée",
}


class ErreurSirene(Exception):
    pass


def normaliser_siren(valeur: str) -> str:
    chiffres = "".join(c for c in (valeur or "") if c.isdigit())
    if len(chiffres) == 14:  # SIRET saisi : on garde le SIREN
        chiffres = chiffres[:9]
    if len(chiffres) != 9:
        raise ErreurSirene("Le SIREN doit comporter 9 chiffres.")
    return chiffres


def rechercher(siren: str) -> dict:
    siren = normaliser_siren(siren)
    req = urllib.request.Request(URL.format(siren=siren), headers={"User-Agent": "onboarding-cabinet"})
    try:
        with urllib.request.urlopen(req, timeout=10) as rep:
            donnees = json.load(rep)
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
        raise ErreurSirene(f"Service indisponible ({e}). Réessayez ou saisissez à la main.") from e

    resultats = [r for r in donnees.get("results", []) if r.get("siren") == siren]
    if not resultats:
        raise ErreurSirene("Aucune entreprise trouvée pour ce SIREN.")
    return extraire(resultats[0])


def extraire(r: dict) -> dict:
    """Transforme la réponse de l'API en champs de la fiche client."""
    siege = r.get("siege") or {}
    code_fj = str(r.get("nature_juridique") or "")
    dirigeants = []
    for d in r.get("dirigeants") or []:
        if d.get("type_dirigeant") == "personne morale":
            nom = d.get("denomination", "")
        else:
            nom = f"{d.get('prenoms', '')} {d.get('nom', '')}".strip()
        dirigeants.append({"nom": nom, "qualite": d.get("qualite", "")})

    return {
        "siren": r.get("siren", ""),
        "denomination": r.get("nom_raison_sociale") or r.get("nom_complet", ""),
        "forme_juridique": FORMES_JURIDIQUES.get(code_fj, f"Code INSEE {code_fj}" if code_fj else ""),
        "adresse_siege": siege.get("adresse", ""),
        "code_naf": r.get("activite_principale", "") or siege.get("activite_principale", ""),
        "date_creation": r.get("date_creation") or "",
        "etat": "Active" if r.get("etat_administratif") == "A" else "Cessée",
        "dirigeants": dirigeants,
        "brut": r,
    }
