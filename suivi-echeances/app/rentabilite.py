"""Rentabilité des dossiers : chiffre d'affaires, temps passés et coût du temps."""

import calendar
from collections import defaultdict
from datetime import date

from .db import parametre


def bornes(mois, cumul):
    """Période analysée : le mois, ou du 1er janvier à la fin du mois si cumul."""
    annee, m = int(mois[:4]), int(mois[5:7])
    debut = date(annee, 1, 1) if cumul else date(annee, m, 1)
    fin = date(annee, m, calendar.monthrange(annee, m)[1])
    return debut, fin, (m if cumul else 1)


def calculer(conn, mois, cumul=False, ca_mode="facture"):
    """Renvoie (lignes par dossier, totaux, lignes par collaborateur, clients non rapprochés).

    ca_mode : « facture » (factures émises sur la période) ou « lisse »
    (honoraires annuels du dossier × nombre de mois / 12).
    """
    debut, fin, nb_mois = bornes(mois, cumul)
    d0, d1 = debut.isoformat(), fin.isoformat()
    coef_ht = 1 / 1.2 if parametre(conn, "factures_ttc", "0") == "1" else 1.0

    dossiers = {d["id"]: d for d in conn.execute(
        """SELECT d.*, u.nom AS collaborateur FROM dossiers d LEFT JOIN users u ON u.id = d.collaborateur_id
           WHERE d.actif = 1""")}
    lignes = {i: {"dossier": d, "ca": 0.0, "heures": 0.0, "heures_facturables": 0.0, "heures_perdues": 0.0,
                  "cout": 0.0, "taux_manquant": False, "par_collaborateur": defaultdict(float)}
              for i, d in dossiers.items()}

    if ca_mode == "lisse":
        for i, d in dossiers.items():
            lignes[i]["ca"] = (d["honoraires_annuels"] or 0) * nb_mois / 12
    else:
        for f in conn.execute("""SELECT t.dossier_id, SUM(f.montant) AS montant FROM factures f
                                 JOIN tiers t ON t.nom_normalise = f.tiers
                                 WHERE f.date BETWEEN ? AND ? AND t.dossier_id IS NOT NULL
                                 GROUP BY t.dossier_id""", (d0, d1)):
            if f["dossier_id"] in lignes:
                lignes[f["dossier_id"]]["ca"] = f["montant"] * coef_ht

    collaborateurs = defaultdict(lambda: {"heures": 0.0, "heures_facturables": 0.0, "heures_perdues": 0.0,
                                          "cout": 0.0, "taux": None})
    for t in conn.execute(
            """SELECT ti.dossier_id, tp.user_id, COALESCE(u.nom, tp.collaborateur) AS nom, u.taux_horaire,
                      tp.duree_s, tp.facturable, COALESCE(a.temps_perdu, 0) AS perdu
               FROM temps tp LEFT JOIN tiers ti ON ti.nom_normalise = tp.tiers
               LEFT JOIN users u ON u.id = tp.user_id LEFT JOIN activites a ON a.code = tp.activite_code
               WHERE tp.date BETWEEN ? AND ?""", (d0, d1)):
        h = t["duree_s"] / 3600
        c = collaborateurs[t["nom"] or "Inconnu"]
        c["taux"] = t["taux_horaire"]
        c["heures"] += h
        c["heures_facturables"] += h if t["facturable"] else 0
        c["heures_perdues"] += h if t["perdu"] else 0
        c["cout"] += h * (t["taux_horaire"] or 0)
        l = lignes.get(t["dossier_id"])
        if l is None:
            continue
        l["heures"] += h
        l["heures_facturables"] += h if t["facturable"] else 0
        l["heures_perdues"] += h if t["perdu"] else 0
        l["cout"] += h * (t["taux_horaire"] or 0)
        l["taux_manquant"] |= t["taux_horaire"] is None
        l["par_collaborateur"][t["nom"] or "Inconnu"] += h

    resultat = []
    for l in lignes.values():
        if not (l["ca"] or l["heures"]):
            continue
        d = l["dossier"]
        l["marge"] = l["ca"] - l["cout"]
        l["marge_pct"] = l["marge"] / l["ca"] * 100 if l["ca"] else None
        l["taux_reel"] = l["ca"] / l["heures"] if l["heures"] else None
        l["budget"] = d["budget_heures"] * nb_mois / 12 if d["budget_heures"] else None
        l["depassement"] = max(0.0, l["heures"] - l["budget"]) if l["budget"] is not None else None
        l["par_collaborateur"] = sorted(l["par_collaborateur"].items(), key=lambda x: -x[1])
        resultat.append(l)
    resultat.sort(key=lambda l: l["marge"])

    totaux = {k: sum(l[k] for l in resultat) for k in ("ca", "heures", "heures_facturables", "heures_perdues", "cout")}
    totaux["marge"] = totaux["ca"] - totaux["cout"]
    totaux["taux_reel"] = totaux["ca"] / totaux["heures"] if totaux["heures"] else None

    non_rapproches = conn.execute(
        """SELECT ti.nom,
                  (SELECT SUM(duree_s) FROM temps WHERE tiers = ti.nom_normalise AND date BETWEEN ? AND ?) AS duree_s,
                  (SELECT SUM(montant) FROM factures WHERE tiers = ti.nom_normalise AND date BETWEEN ? AND ?) AS montant
           FROM tiers ti WHERE ti.dossier_id IS NULL""", (d0, d1, d0, d1)).fetchall()
    non_rapproches = [r for r in non_rapproches if r["duree_s"] or r["montant"]]

    return resultat, totaux, sorted(collaborateurs.items()), non_rapproches, (debut, fin)
