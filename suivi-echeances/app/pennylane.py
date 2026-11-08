"""Connexion à Pennylane : lecture des dossiers, déclarations, temps et factures.

Deux sources interchangeables, qui renvoient les mêmes données normalisées :

- ``ApiSource`` interroge directement Pennylane avec le jeton API du cabinet
  (variable d'environnement ``PENNYLANE_TOKEN``). Les adresses des services
  sont dans ``PENNYLANE_ENDPOINTS`` (voir ``ENDPOINTS_PAR_DEFAUT``).
- ``FichierSource`` lit un export JSON (même format que les réponses de
  Pennylane), utile pour un import ponctuel ou pour les tests.

Les fonctions ``normaliser_*`` convertissent les réponses de Pennylane dans
le format interne de l'application.
"""

import json
import re
import time
import unicodedata

import requests

FORMES = {
    "fr_sas": "SAS", "fr_sasu": "SASU", "fr_sarl": "SARL", "fr_eurl": "EURL",
    "fr_sci": "SCI", "fr_sa": "SA", "fr_snc": "SNC", "fr_association": "Association",
    "fr_ei": "EI", "fr_eirl": "EI", "fr_micro": "EI", "fr_auto_entrepreneur": "EI",
}

REGIMES_FISCAUX = {"is": "IS", "bic": "IR - BIC", "bnc": "IR - BNC", "rf": "IR - revenus fonciers"}

# Statuts de télédéclaration Pennylane -> traitement dans l'application.
STATUTS_FAIT = {"accepted"}
STATUTS_REJET = {"rejected", "refused", "error", "failed"}


def normaliser_nom(nom):
    """Clé de rapprochement d'un nom de client : sans accents, casse ni ponctuation."""
    nom = unicodedata.normalize("NFKD", nom or "").encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", " ", nom.lower()).strip()


def normaliser_dossier(c):
    """Fiche client du portefeuille cabinet -> dossier."""
    forme = FORMES.get(c.get("legal_form") or "", None)
    frequence, regime = c.get("vat_frequency"), c.get("vat_regime")
    if regime in (None, "", "none", "franchise", "exempt", "not_subject"):
        regime_tva = "Franchise en base" if regime else None
    elif frequence == "monthly":
        regime_tva = "Mensuel (CA3)"
    elif frequence == "quarterly":
        regime_tva = "Trimestriel (CA3)"
    elif frequence == "yearly":
        regime_tva = "Simplifié (CA12)"
    else:
        regime_tva = None
    exercice = c.get("current_fiscal_year") or {}
    comptable = c.get("accountant") or {}
    return {
        "pennylane_id": str(c["id"]),
        "nom": c.get("display_name") or c.get("name"),
        "noms_alternatifs": [n for n in (c.get("name"), c.get("trade_name")) if n],
        "forme": forme,
        "siren": c.get("siren"),
        "cloture": exercice.get("finish"),
        "regime_tva": regime_tva,
        "salaries": c.get("number_of_employees") not in (None, "", "individual", "none", "0"),
        "collaborateur": {
            "pennylane_user_id": str(comptable["id"]),
            "email": comptable.get("email"),
            "nom": comptable.get("full_name") or comptable.get("display_name"),
        } if comptable.get("id") else None,
    }


def normaliser_tva(r):
    return {
        "periode_fin": r.get("period_end"),
        "date_limite": r.get("due_date"),
        "date_depot": r.get("submitted_at"),
        "statut": (r.get("status") or "").lower(),
    }


def normaliser_liasse(r):
    return {
        "periode_fin": r.get("period_end"),
        "categorie": (r.get("fiscal_category") or "").lower(),
        "statut": (r.get("teledec_status") or r.get("status") or "").lower(),
        "date_depot": r.get("submitted_at") or r.get("sent_at"),
    }


def normaliser_temps(e):
    user = e.get("user") or {}
    activite = e.get("timesheets_activity") or {}
    groupe = activite.get("activity_group") or {}
    tiers = (e.get("thirdparty") or {}).get("name")
    return {
        "pennylane_id": str(e["id"]),
        "date": e["date"],
        "pennylane_user_id": str(user["id"]) if user.get("id") else None,
        "email": user.get("email"),
        "collaborateur": user.get("full_name"),
        "tiers_nom": tiers,
        "activite_code": activite.get("code"),
        "activite_nom": activite.get("name"),
        "mission": groupe.get("name"),
        "facturable": bool(e.get("billable")),
        "duree_s": int(e.get("duration") or 0),
        "description": e.get("description"),
    }


LIBELLE_FACTURE = re.compile(r"^(?:Facture|Avoir)\s+(?P<client>.+?)\s+-\s+(?P<numero>\S+)\s*$")


def normaliser_facture(f):
    """Facture émise par le cabinet. Le client est lu dans le tiers, sinon dans le libellé."""
    client = ((f.get("customer") or f.get("thirdparty") or {}).get("name"))
    numero = f.get("invoice_number")
    m = LIBELLE_FACTURE.match(f.get("label") or "")
    if m:
        client = client or m["client"]
        numero = numero or m["numero"]
    montant = f.get("currency_amount_before_tax") or f.get("amount_before_tax") or f.get("amount")
    return {
        "pennylane_id": str(f["id"]),
        "date": f["date"],
        "numero": numero,
        "tiers_nom": client,
        "montant": float(montant or 0),
        "montant_ht": any(k in f for k in ("currency_amount_before_tax", "amount_before_tax")),
    }


class FichierSource:
    """Export JSON : {"dossiers": [...], "tva": {id: [...]}, "liasses": {id: [...]},
    "temps": [...], "factures": [...]}, chaque élément au format Pennylane."""

    def __init__(self, chemin):
        with open(chemin, encoding="utf-8") as f:
            self.data = json.load(f)

    def dossiers(self):
        return [normaliser_dossier(c) for c in self.data.get("dossiers", [])]

    def declarations_tva(self, pennylane_id):
        return [normaliser_tva(r) for r in self.data.get("tva", {}).get(str(pennylane_id), [])]

    def liasses(self, pennylane_id):
        return [normaliser_liasse(r) for r in self.data.get("liasses", {}).get(str(pennylane_id), [])]

    def temps(self, depuis):
        return [normaliser_temps(e) for e in self.data.get("temps", []) if e["date"] >= depuis]

    def factures(self, depuis):
        return [normaliser_facture(f) for f in self.data.get("factures", []) if f["date"] >= depuis]


# Chemins relatifs à PENNYLANE_BASE_URL. {firm_id}, {company_id} et
# {own_company_id} sont remplacés à l'exécution. À valider avec la
# documentation de votre accès API cabinet : surchargeables par
# la variable d'environnement PENNYLANE_ENDPOINTS (JSON).
ENDPOINTS_PAR_DEFAUT = {
    "dossiers": "/portfolio/crm/companies/entry",
    "tva": "/companies/{company_id}/vat_returns",
    "liasses": "/companies/{company_id}/tax_returns",
    "temps": "/firms/{firm_id}/own_company/timesheet_entries",
    "factures": "/companies/{own_company_id}/customer_invoices",
}

CLES_LISTE = {
    "dossiers": "companies", "tva": "vat_returns", "liasses": "tax_returns",
    "temps": "timesheet_entries", "factures": "customer_invoices",
}


class ErreurPennylane(Exception):
    pass


class ApiSource:
    def __init__(self, token, base_url, firm_id, own_company_id, endpoints=None, session=None):
        if not token:
            raise ErreurPennylane("Jeton Pennylane absent (PENNYLANE_TOKEN).")
        self.base_url = base_url.rstrip("/")
        self.ids = {"firm_id": firm_id, "own_company_id": own_company_id}
        self.endpoints = {**ENDPOINTS_PAR_DEFAUT, **(endpoints or {})}
        self.http = session or requests.Session()
        self.http.headers.update({"Authorization": f"Bearer {token}", "Accept": "application/json"})

    def _get(self, url, params):
        for tentative in range(4):
            r = self.http.get(url, params=params, timeout=30)
            if r.status_code == 429:  # limite de débit : on patiente puis on réessaie
                time.sleep(2 ** tentative)
                continue
            if r.status_code >= 400:
                raise ErreurPennylane(f"Pennylane a répondu {r.status_code} sur {url} : {r.text[:200]}")
            return r.json()
        raise ErreurPennylane(f"Limite de débit Pennylane dépassée sur {url}")

    def _lister(self, nom, filtre=None, **ids):
        url = self.base_url + self.endpoints[nom].format(**self.ids, **ids)
        page, elements = 1, []
        while True:
            params = {"page": page, "per_page": 100}
            if filtre:
                params["filter"] = json.dumps(filtre)
            data = self._get(url, params)
            elements += data.get(CLES_LISTE[nom], [])
            pagination = data.get("pagination") or {}
            if not pagination.get("hasNextPage"):
                return elements
            page += 1

    def dossiers(self):
        return [normaliser_dossier(c) for c in self._lister("dossiers")]

    def declarations_tva(self, pennylane_id):
        return [normaliser_tva(r) for r in self._lister("tva", company_id=pennylane_id)]

    def liasses(self, pennylane_id):
        return [normaliser_liasse(r) for r in self._lister("liasses", company_id=pennylane_id)]

    def temps(self, depuis):
        filtre = [{"field": "date", "operator": "gteq", "value": depuis}]
        return [normaliser_temps(e) for e in self._lister("temps", filtre)]

    def factures(self, depuis):
        filtre = [{"field": "date", "operator": "gteq", "value": depuis}]
        return [normaliser_facture(f) for f in self._lister("factures", filtre)]


def source_depuis_config(config):
    if config.get("PENNYLANE_FICHIER"):
        return FichierSource(config["PENNYLANE_FICHIER"])
    return ApiSource(
        token=config.get("PENNYLANE_TOKEN"),
        base_url=config.get("PENNYLANE_BASE_URL", "https://app.pennylane.com/api/external/v2"),
        firm_id=config.get("PENNYLANE_FIRM_ID"),
        own_company_id=config.get("PENNYLANE_OWN_COMPANY_ID"),
        endpoints=json.loads(config["PENNYLANE_ENDPOINTS"]) if config.get("PENNYLANE_ENDPOINTS") else None,
    )
