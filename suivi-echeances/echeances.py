"""Moteur de génération des échéances (France / Bénin) à partir du profil d'un dossier.

Usage :
    python echeances.py dossiers.json --du 2026-09-25 --au 2027-09-30 > echeances.json
    python echeances.py --referentiel > referentiel.json

Un dossier est un objet JSON reprenant les propriétés de la base Notion « Dossiers » :
    {"dossier": "ACME SAS", "pays": "France", "forme": "SAS", "cloture": "2026-12-31",
     "regime_imposition": "IS", "regime_tva": "Mensuel (CA3)", "jour_tva": 19,
     "salaries": true, "effectif": 12, "cfe": true, "acompte_cfe": false,
     "cvae": false, "depot_comptes": true}

Les dates tombant un samedi, un dimanche ou un jour férié sont reportées au
premier jour ouvré suivant.
"""

import argparse
import calendar
import json
import sys
from datetime import date, timedelta

MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet",
        "août", "septembre", "octobre", "novembre", "décembre"]

PORTAIL_IMPOTS_FR = "https://www.impots.gouv.fr/professionnel"
PORTAIL_DSN = "https://www.net-entreprises.fr"
PORTAIL_GREFFE = "https://www.infogreffe.fr"
PORTAIL_DGI_BJ = "https://eservices.impots.bj"
PORTAIL_CNSS_BJ = "https://www.cnss.bj"

# Référentiel : documente les règles appliquées dans generer() ci-dessous.
REFERENTIEL = [
    # --- France ---
    ("FR-TVA-M", "TVA — CA3 mensuelle", "France", "Fiscale", "Régime TVA = Mensuel (CA3)", "Mensuelle",
     "Jour limite TVA (15 à 24 selon le SIE) du mois suivant", PORTAIL_IMPOTS_FR, False),
    ("FR-TVA-T", "TVA — CA3 trimestrielle", "France", "Fiscale", "Régime TVA = Trimestriel (CA3)", "Trimestrielle",
     "Jour limite TVA du mois suivant le trimestre", PORTAIL_IMPOTS_FR, False),
    ("FR-TVA-CA12-AC", "TVA — acomptes CA12 (juillet 55 %, décembre 40 %)", "France", "Fiscale",
     "Régime TVA = Simplifié (CA12)", "Annuelle", "Jour limite TVA de juillet et de décembre", PORTAIL_IMPOTS_FR, False),
    ("FR-TVA-CA12", "TVA — déclaration annuelle CA12", "France", "Fiscale", "Régime TVA = Simplifié (CA12)",
     "Selon clôture", "Clôture 31/12 : 2e jour ouvré suivant le 1er mai ; sinon 3 mois après la clôture",
     PORTAIL_IMPOTS_FR, False),
    ("FR-IS-AC", "IS — acomptes (2571)", "France", "Fiscale", "Régime d'imposition = IS", "Trimestrielle",
     "15 du 3e, 6e, 9e et 12e mois de l'exercice (dispense si IS N-1 < 3 000 €)", PORTAIL_IMPOTS_FR, False),
    ("FR-IS-SOLDE", "IS — relevé de solde (2572)", "France", "Fiscale", "Régime d'imposition = IS", "Selon clôture",
     "Clôture 31/12 : 15 mai ; sinon 15 du 4e mois après la clôture", PORTAIL_IMPOTS_FR, False),
    ("FR-LIASSE", "Liasse fiscale (2065 / 2031 / 2035 / 2072)", "France", "Fiscale", "Tous dossiers", "Selon clôture",
     "Clôture 31/12 : 2e jour ouvré suivant le 1er mai + 15 jours (télétransmission) ; sinon 3 mois après la clôture + 15 jours",
     PORTAIL_IMPOTS_FR, False),
    ("FR-DAS2", "DAS2 — honoraires versés", "France", "Fiscale", "Tous dossiers (si honoraires > 1 200 €/bénéficiaire)",
     "Selon clôture", "Même date que la liasse fiscale", PORTAIL_IMPOTS_FR, False),
    ("FR-CFE-AC", "CFE — acompte", "France", "Fiscale", "CFE et acompte CFE (CFE N-1 ≥ 3 000 €)", "Annuelle",
     "15 juin", PORTAIL_IMPOTS_FR, False),
    ("FR-CFE", "CFE — paiement du solde", "France", "Fiscale", "CFE", "Annuelle", "15 décembre", PORTAIL_IMPOTS_FR, False),
    ("FR-CVAE-AC", "CVAE — acomptes (1329-AC)", "France", "Fiscale", "CVAE", "Annuelle", "15 juin et 15 septembre",
     PORTAIL_IMPOTS_FR, False),
    ("FR-CVAE", "CVAE — déclaration 1330 et solde 1329-DEF", "France", "Fiscale", "CVAE", "Annuelle",
     "2e jour ouvré suivant le 1er mai (1329-DEF) ; 1330 avec la liasse", PORTAIL_IMPOTS_FR, False),
    ("FR-DSN", "DSN mensuelle", "France", "Sociale", "Salariés", "Mensuelle",
     "5 du mois suivant si effectif ≥ 50, sinon 15 du mois suivant", PORTAIL_DSN, False),
    ("FR-CPTES", "Comptes annuels — révision et production du bilan", "France", "Comptable", "Tous dossiers",
     "Selon clôture", "Objectif cabinet : 3 mois après la clôture", None, False),
    ("FR-AG", "AG d'approbation des comptes", "France", "Juridique", "Sociétés (hors EI)", "Selon clôture",
     "6 mois après la clôture", None, False),
    ("FR-DEPOT", "Dépôt des comptes au greffe", "France", "Juridique", "Dépôt des comptes", "Selon clôture",
     "1 mois après l'AG (2 mois en ligne) : retenu 7 mois après la clôture", PORTAIL_GREFFE, False),
    # --- Bénin ---
    ("BJ-TVA", "TVA — déclaration mensuelle", "Bénin", "Fiscale", "Régime TVA = Mensuel (Bénin)", "Mensuelle",
     "10 du mois suivant", PORTAIL_DGI_BJ, False),
    ("BJ-ITS", "ITS et VPS — retenues sur salaires", "Bénin", "Fiscale", "Salariés", "Mensuelle",
     "10 du mois suivant", PORTAIL_DGI_BJ, False),
    ("BJ-AIB", "AIB — reversement des retenues", "Bénin", "Fiscale", "Tous dossiers (si opérations soumises à AIB)",
     "Mensuelle", "10 du mois suivant", PORTAIL_DGI_BJ, False),
    ("BJ-CNSS", "CNSS — déclaration et paiement des cotisations", "Bénin", "Sociale", "Salariés", "Mensuelle",
     "15 du mois suivant si effectif ≥ 20 ; sinon trimestriel, 15 du mois suivant le trimestre", PORTAIL_CNSS_BJ, True),
    ("BJ-IS-AC", "IS — acomptes", "Bénin", "Fiscale", "Régime d'imposition = IS", "Trimestrielle",
     "10 mars, 10 juin, 10 septembre, 10 décembre", PORTAIL_DGI_BJ, False),
    ("BJ-DSF", "Dépôt des états financiers (DSF) et solde IS", "Bénin", "Fiscale", "Tous dossiers", "Annuelle",
     "30 avril de l'année suivant la clôture", PORTAIL_DGI_BJ, False),
    ("BJ-PATENTE", "Patente", "Bénin", "Fiscale", "Tous dossiers", "Annuelle",
     "Non générée automatiquement : échéance à confirmer selon le CGI et l'avis d'imposition", PORTAIL_DGI_BJ, True),
    ("BJ-CPTES", "États financiers SYSCOHADA — révision et production", "Bénin", "Comptable", "Tous dossiers",
     "Selon clôture", "Objectif cabinet : 3 mois après la clôture", None, False),
    ("BJ-AG", "AGO d'approbation des comptes (OHADA)", "Bénin", "Juridique", "Sociétés (hors EI)", "Selon clôture",
     "6 mois après la clôture", None, False),
    ("BJ-RCCM", "Dépôt des états financiers au RCCM", "Bénin", "Juridique", "Dépôt des comptes", "Selon clôture",
     "1 mois après l'AGO : retenu 7 mois après la clôture", None, True),
]


# ---------------------------------------------------------------- calendrier

def paques(annee):
    a, b, c = annee % 19, annee // 100, annee % 100
    d, e = b // 4, b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = c // 4, c % 4
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    mois = (h + l - 7 * m + 114) // 31
    jour = (h + l - 7 * m + 114) % 31 + 1
    return date(annee, mois, jour)


def feries(pays, annee):
    p = paques(annee)
    mobiles = {p + timedelta(days=1), p + timedelta(days=39), p + timedelta(days=50)}
    if pays == "France":
        fixes = [(1, 1), (5, 1), (5, 8), (7, 14), (8, 15), (11, 1), (11, 11), (12, 25)]
    else:  # Bénin : fêtes fixes et chrétiennes ; les fêtes musulmanes (mobiles) ne sont pas gérées.
        fixes = [(1, 1), (1, 10), (5, 1), (8, 1), (8, 15), (11, 1), (12, 25)]
    return mobiles | {date(annee, m, j) for m, j in fixes}


def jour_ouvre(d, pays):
    while d.weekday() >= 5 or d in feries(pays, d.year):
        d += timedelta(days=1)
    return d


def ajouter_mois(d, n):
    m = d.month - 1 + n
    annee, mois = d.year + m // 12, m % 12 + 1
    return date(annee, mois, min(d.day, calendar.monthrange(annee, mois)[1]))


def fin_de_mois(d):
    return date(d.year, d.month, calendar.monthrange(d.year, d.month)[1])


def jour_du_mois(annee, mois, jour):
    return date(annee, mois, min(jour, calendar.monthrange(annee, mois)[1]))


def deuxieme_jour_ouvre_apres_1er_mai(annee):
    d, n = date(annee, 5, 1), 0
    while n < 2:
        d += timedelta(days=1)
        if d.weekday() < 5 and d not in feries("France", annee):
            n += 1
    return d


def mois_entre(du, au):
    """Liste des (année, mois) de du à au inclus."""
    a, m = du.year, du.month
    while (a, m) <= (au.year, au.month):
        yield a, m
        a, m = (a + 1, 1) if m == 12 else (a, m + 1)


# ---------------------------------------------------------------- génération

def generer(dos, du, au):
    pays = dos["pays"]
    ref = {r[0]: r for r in REFERENTIEL}
    lignes = []

    def ajout(code, date_brute, periode, titre=None):
        d = jour_ouvre(date_brute, pays)
        if du <= d <= au:
            r = ref[code]
            lignes.append({
                "echeance": f"{titre or r[1]} — {periode}",
                "dossier": dos["dossier"], "code": code, "categorie": r[3], "pays": pays,
                "date_limite": d.isoformat(), "periode": periode, "portail": r[7],
            })

    # Exercices : celui qui se clôture à la date indiquée, le précédent et le suivant.
    cloture = date.fromisoformat(dos["cloture"])
    clotures = [ajouter_mois(cloture, 12 * k) for k in (-1, 0, 1)]
    clotures = [fin_de_mois(c) if cloture == fin_de_mois(cloture) else c for c in clotures]
    societe = dos.get("forme") not in (None, "EI")
    regime = dos.get("regime_imposition")
    tva = dos.get("regime_tva")
    jour_tva = int(dos.get("jour_tva") or (10 if pays == "Bénin" else 19))
    effectif = dos.get("effectif") or 0

    # Périodes mensuelles : période M, échéance le mois M+1.
    for a, m in mois_entre(ajouter_mois(du, -3), au):
        suiv = ajouter_mois(date(a, m, 1), 1)
        periode = f"{MOIS[m - 1]} {a}"
        if pays == "France":
            if tva == "Mensuel (CA3)":
                ajout("FR-TVA-M", jour_du_mois(suiv.year, suiv.month, jour_tva), periode)
            if tva == "Trimestriel (CA3)" and m % 3 == 0:
                ajout("FR-TVA-T", jour_du_mois(suiv.year, suiv.month, jour_tva), f"T{m // 3} {a}")
            if tva == "Simplifié (CA12)" and m in (7, 12):
                ajout("FR-TVA-CA12-AC", jour_du_mois(a, m, jour_tva), f"acompte {MOIS[m - 1]} {a}")
            if dos.get("salaries"):
                ajout("FR-DSN", date(suiv.year, suiv.month, 5 if effectif >= 50 else 15), periode)
            if dos.get("cfe"):
                if m == 6 and dos.get("acompte_cfe"):
                    ajout("FR-CFE-AC", date(a, 6, 15), str(a))
                if m == 12:
                    ajout("FR-CFE", date(a, 12, 15), str(a))
            if dos.get("cvae") and m in (6, 9):
                ajout("FR-CVAE-AC", date(a, m, 15), f"acompte {MOIS[m - 1]} {a}")
            if dos.get("cvae") and m == 5:
                ajout("FR-CVAE", deuxieme_jour_ouvre_apres_1er_mai(a), f"CVAE {a - 1}")
        else:
            if tva == "Mensuel (Bénin)":
                ajout("BJ-TVA", jour_du_mois(suiv.year, suiv.month, jour_tva), periode)
            if dos.get("salaries"):
                ajout("BJ-ITS", date(suiv.year, suiv.month, 10), periode)
                if effectif >= 20:
                    ajout("BJ-CNSS", date(suiv.year, suiv.month, 15), periode)
                elif m % 3 == 0:
                    ajout("BJ-CNSS", date(suiv.year, suiv.month, 15), f"T{m // 3} {a}")
            ajout("BJ-AIB", date(suiv.year, suiv.month, 10), periode)
            if regime == "IS" and m in (3, 6, 9, 12):
                ajout("BJ-IS-AC", date(a, m, 10), f"acompte {MOIS[m - 1]} {a}")

    # Échéances liées à la clôture de chaque exercice.
    for c in clotures:
        ex = f"exercice clos le {c.strftime('%d/%m/%Y')}"
        cal = (c.month, c.day) == (12, 31)
        if pays == "France":
            liasse = (deuxieme_jour_ouvre_apres_1er_mai(c.year + 1) if cal
                      else fin_de_mois(ajouter_mois(c, 3))) + timedelta(days=15)
            ajout("FR-LIASSE", liasse, ex)
            ajout("FR-DAS2", liasse, ex)
            if regime == "IS":
                debut = c - timedelta(days=364)
                for k in (2, 5, 8, 11):
                    mois_ac = ajouter_mois(date(debut.year, debut.month, 1), k)
                    ajout("FR-IS-AC", date(mois_ac.year, mois_ac.month, 15),
                          f"acompte {MOIS[mois_ac.month - 1]} {mois_ac.year}")
                solde = date(c.year + 1, 5, 15) if cal else jour_du_mois(*_am(c, 4), 15)
                ajout("FR-IS-SOLDE", solde, ex)
            if tva == "Simplifié (CA12)":
                ajout("FR-TVA-CA12", deuxieme_jour_ouvre_apres_1er_mai(c.year + 1) if cal
                      else fin_de_mois(ajouter_mois(c, 3)), ex)
            ajout("FR-CPTES", fin_de_mois(ajouter_mois(c, 3)), ex)
            if societe:
                ajout("FR-AG", fin_de_mois(ajouter_mois(c, 6)), ex)
            if dos.get("depot_comptes"):
                ajout("FR-DEPOT", fin_de_mois(ajouter_mois(c, 7)), ex)
        else:
            ajout("BJ-DSF", date(c.year + 1, 4, 30), ex)
            ajout("BJ-CPTES", fin_de_mois(ajouter_mois(c, 3)), ex)
            if societe:
                ajout("BJ-AG", fin_de_mois(ajouter_mois(c, 6)), ex)
            if dos.get("depot_comptes"):
                ajout("BJ-RCCM", fin_de_mois(ajouter_mois(c, 7)), ex)

    # Dédoublonnage (un même acompte peut être vu depuis deux exercices).
    uniques = {(l["code"], l["date_limite"]): l for l in lignes}
    return sorted(uniques.values(), key=lambda l: (l["date_limite"], l["code"]))


def _am(d, n):
    x = ajouter_mois(d, n)
    return x.year, x.month


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("dossiers", nargs="?", help="Fichier JSON : liste de dossiers")
    p.add_argument("--du", default=date.today().isoformat())
    p.add_argument("--au")
    p.add_argument("--referentiel", action="store_true", help="Exporter le référentiel des obligations")
    args = p.parse_args()

    if args.referentiel:
        champs = ["code", "obligation", "pays", "categorie", "condition", "periodicite", "regle", "portail", "a_verifier"]
        json.dump([dict(zip(champs, r)) for r in REFERENTIEL], sys.stdout, ensure_ascii=False, indent=2)
        return
    du = date.fromisoformat(args.du)
    au = date.fromisoformat(args.au) if args.au else ajouter_mois(du, 12)
    with open(args.dossiers, encoding="utf-8") as f:
        dossiers = json.load(f)
    json.dump([l for d in dossiers for l in generer(d, du, au)], sys.stdout, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    main()
