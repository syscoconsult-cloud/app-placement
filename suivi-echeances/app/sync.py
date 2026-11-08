"""Synchronisation avec Pennylane et génération des échéances."""

from datetime import date, datetime, timedelta

from echeances import ajouter_mois, generer

from .pennylane import STATUTS_FAIT, STATUTS_REJET, REGIMES_FISCAUX, normaliser_nom

CODES_TVA = ("FR-TVA-M", "FR-TVA-T")


# ------------------------------------------------------------ collaborateurs

def collaborateur_id(conn, info):
    """Retrouve (ou crée, sans mot de passe) le collaborateur Pennylane d'un dossier."""
    if not info:
        return None
    row = conn.execute("SELECT id FROM users WHERE pennylane_user_id = ? OR (email = ? AND email IS NOT NULL)",
                       (info["pennylane_user_id"], info.get("email"))).fetchone()
    if row:
        conn.execute("UPDATE users SET pennylane_user_id = ? WHERE id = ?", (info["pennylane_user_id"], row["id"]))
        return row["id"]
    if not info.get("email"):
        return None
    cur = conn.execute("INSERT INTO users (email, nom, pennylane_user_id) VALUES (?, ?, ?)",
                       (info["email"].lower(), info.get("nom") or info["email"], info["pennylane_user_id"]))
    return cur.lastrowid


def associer_tiers(conn, nom, dossier_id=None):
    """Enregistre un nom de client ; renvoie sa clé normalisée."""
    cle = normaliser_nom(nom)
    if not cle:
        return None
    conn.execute("INSERT INTO tiers (nom_normalise, nom, dossier_id) VALUES (?, ?, ?) "
                 "ON CONFLICT(nom_normalise) DO UPDATE SET dossier_id = COALESCE(tiers.dossier_id, excluded.dossier_id)",
                 (cle, nom, dossier_id))
    return cle


# ------------------------------------------------------------ dossiers

def importer_dossiers(conn, source, aujourd_hui):
    """Crée ou met à jour les dossiers à partir du portefeuille Pennylane.

    Les champs connus de Pennylane (nom, forme, clôture, TVA, collaborateur)
    sont mis à jour à chaque synchronisation ; les champs saisis dans
    l'application (salariés, CFE, CVAE, dépôt des comptes, budget) ne sont
    renseignés qu'à la création.
    """
    nb = 0
    for d in source.dossiers():
        collab = collaborateur_id(conn, d["collaborateur"])
        row = conn.execute("SELECT id FROM dossiers WHERE pennylane_id = ?", (d["pennylane_id"],)).fetchone()
        if row:
            dossier_id = row["id"]
            conn.execute("""UPDATE dossiers SET nom = ?, forme = COALESCE(?, forme), siren = COALESCE(?, siren),
                            cloture = COALESCE(?, cloture), regime_tva = COALESCE(?, regime_tva),
                            collaborateur_id = COALESCE(?, collaborateur_id) WHERE id = ?""",
                         (d["nom"], d["forme"], d["siren"], d["cloture"], d["regime_tva"], collab, dossier_id))
        else:
            societe = d["forme"] not in (None, "EI")
            dossier_id = conn.execute(
                """INSERT INTO dossiers (nom, pays, forme, siren, cloture, regime_imposition, regime_tva,
                   salaries, depot_comptes, collaborateur_id, pennylane_id, suivi_depuis)
                   VALUES (?, 'France', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (d["nom"], d["forme"], d["siren"], d["cloture"], "IS" if societe else "IR - BIC",
                 d["regime_tva"], int(d["salaries"]), int(societe), collab, d["pennylane_id"],
                 aujourd_hui.isoformat())).lastrowid
        for nom in [d["nom"], *d["noms_alternatifs"]]:
            associer_tiers(conn, nom, dossier_id)
        nb += 1
    return nb


def profil(dossier):
    return {
        "dossier": dossier["nom"], "pays": dossier["pays"], "forme": dossier["forme"],
        "cloture": dossier["cloture"], "regime_imposition": dossier["regime_imposition"],
        "regime_tva": dossier["regime_tva"], "jour_tva": dossier["jour_tva"],
        "salaries": bool(dossier["salaries"]), "effectif": dossier["effectif"],
        "cfe": bool(dossier["cfe"]), "acompte_cfe": bool(dossier["acompte_cfe"]),
        "cvae": bool(dossier["cvae"]), "depot_comptes": bool(dossier["depot_comptes"]),
    }


def generer_echeances(conn, dossier, aujourd_hui, mois_avant=1, mois_apres=12):
    """Crée ou met à jour les échéances d'un dossier sur la fenêtre glissante.

    Les échéances déjà faites ne sont jamais modifiées. Celles qui ne
    correspondent plus au profil du dossier sont supprimées si elles sont
    encore « À faire » et n'ont pas été commentées.
    """
    if not dossier["cloture"]:
        return 0
    du = ajouter_mois(aujourd_hui.replace(day=1), -mois_avant)
    if dossier["suivi_depuis"]:  # pas d'échéance antérieure à l'entrée du dossier dans l'outil
        du = max(du, date.fromisoformat(dossier["suivi_depuis"]))
    au = ajouter_mois(aujourd_hui, mois_apres)
    lignes = generer(profil(dossier), du, au)
    gardees = set()
    for l in lignes:
        gardees.add((l["code"], l["periode"]))
        conn.execute(
            """INSERT INTO echeances (dossier_id, code, libelle, categorie, pays, date_limite, periode,
               periode_fin, portail) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(dossier_id, code, periode) DO UPDATE SET
                 libelle = excluded.libelle, date_limite = excluded.date_limite,
                 periode_fin = excluded.periode_fin, portail = excluded.portail
               WHERE echeances.statut != 'Fait'""",
            (dossier["id"], l["code"], l["echeance"], l["categorie"], l["pays"], l["date_limite"],
             l["periode"], l["periode_fin"], l["portail"]))
    obsoletes = conn.execute(
        """SELECT id, code, periode FROM echeances WHERE dossier_id = ? AND statut = 'À faire'
           AND source = 'manuel' AND commentaire IS NULL AND date_limite BETWEEN ? AND ?""",
        (dossier["id"], du.isoformat(), au.isoformat())).fetchall()
    for e in obsoletes:
        if (e["code"], e["periode"]) not in gardees:
            conn.execute("DELETE FROM echeances WHERE id = ?", (e["id"],))
    return len(lignes)


def generer_toutes(conn, aujourd_hui):
    total = 0
    for d in conn.execute("SELECT * FROM dossiers WHERE actif = 1").fetchall():
        total += generer_echeances(conn, d, aujourd_hui)
    return total


# ------------------------------------------------------------ déclarations

def _appliquer(conn, echeance, statut_pennylane, date_depot, libelle):
    if echeance is None:
        return False
    if statut_pennylane in STATUTS_FAIT:
        conn.execute("""UPDATE echeances SET statut = 'Fait', date_realisation = COALESCE(?, date_realisation),
                        source = 'pennylane', anomalie = NULL WHERE id = ?""", (date_depot, echeance["id"]))
    elif statut_pennylane in STATUTS_REJET:
        conn.execute("""UPDATE echeances SET statut = 'En cours', source = 'pennylane', anomalie = ?
                        WHERE id = ?""", (f"{libelle} rejetée — à corriger dans Pennylane", echeance["id"]))
    elif date_depot and echeance["statut"] == "À faire":
        conn.execute("UPDATE echeances SET statut = 'En cours', source = 'pennylane' WHERE id = ?",
                     (echeance["id"],))
    else:
        return False
    return True


def synchroniser_dossier(conn, source, dossier, aujourd_hui):
    """Lit les déclarations Pennylane d'un dossier, ajuste son profil, régénère
    ses échéances puis reporte les statuts de TVA et de liasse."""
    tva = source.declarations_tva(dossier["pennylane_id"])
    liasses = source.liasses(dossier["pennylane_id"])

    # Le jour limite de TVA du dossier se lit sur la déclaration la plus récente.
    avec_date = [r for r in tva if r["date_limite"]]
    if avec_date and dossier["regime_tva"] in ("Mensuel (CA3)", "Trimestriel (CA3)"):
        recente = max(avec_date, key=lambda r: r["date_limite"])
        conn.execute("UPDATE dossiers SET jour_tva = ? WHERE id = ?", (int(recente["date_limite"][8:10]), dossier["id"]))
    if liasses:
        regime = REGIMES_FISCAUX.get(max(liasses, key=lambda r: r["periode_fin"] or "")["categorie"])
        if regime:
            conn.execute("UPDATE dossiers SET regime_imposition = ? WHERE id = ?", (regime, dossier["id"]))

    dossier = conn.execute("SELECT * FROM dossiers WHERE id = ?", (dossier["id"],)).fetchone()
    generes = generer_echeances(conn, dossier, aujourd_hui)

    maj = 0
    for r in tva:
        e = conn.execute(f"""SELECT * FROM echeances WHERE dossier_id = ? AND periode_fin = ?
                             AND code IN ({','.join('?' * len(CODES_TVA))})""",
                         (dossier["id"], r["periode_fin"], *CODES_TVA)).fetchone()
        maj += _appliquer(conn, e, r["statut"], r["date_depot"], "Déclaration de TVA")
    for r in liasses:
        e = conn.execute("SELECT * FROM echeances WHERE dossier_id = ? AND code = 'FR-LIASSE' AND periode_fin = ?",
                         (dossier["id"], r["periode_fin"])).fetchone()
        maj += _appliquer(conn, e, r["statut"], r["date_depot"], "Liasse fiscale")
    return generes, maj


# ------------------------------------------------------------ temps et factures

def importer_temps(conn, source, depuis):
    nb = 0
    for t in source.temps(depuis):
        user = conn.execute("SELECT id FROM users WHERE pennylane_user_id = ? OR email = ?",
                            (t["pennylane_user_id"], (t["email"] or "").lower())).fetchone()
        tiers = associer_tiers(conn, t["tiers_nom"])
        if t["activite_code"]:
            conn.execute("INSERT INTO activites (code, nom, groupe) VALUES (?, ?, ?) "
                         "ON CONFLICT(code) DO UPDATE SET nom = excluded.nom, groupe = excluded.groupe",
                         (t["activite_code"], t["activite_nom"], t["mission"]))
        conn.execute(
            """INSERT INTO temps (pennylane_id, date, user_id, collaborateur, tiers, activite_code, activite_nom,
               mission, facturable, duree_s, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(pennylane_id) DO UPDATE SET date = excluded.date, user_id = excluded.user_id,
                 tiers = excluded.tiers, activite_code = excluded.activite_code,
                 activite_nom = excluded.activite_nom, mission = excluded.mission,
                 facturable = excluded.facturable, duree_s = excluded.duree_s, description = excluded.description""",
            (t["pennylane_id"], t["date"], user["id"] if user else None, t["collaborateur"], tiers,
             t["activite_code"], t["activite_nom"], t["mission"], int(t["facturable"]), t["duree_s"],
             t["description"]))
        nb += 1
    return nb


def importer_factures(conn, source, depuis):
    nb = 0
    for f in source.factures(depuis):
        tiers = associer_tiers(conn, f["tiers_nom"])
        conn.execute(
            """INSERT INTO factures (pennylane_id, date, numero, tiers, montant) VALUES (?, ?, ?, ?, ?)
               ON CONFLICT(pennylane_id) DO UPDATE SET date = excluded.date, numero = excluded.numero,
                 tiers = excluded.tiers, montant = excluded.montant""",
            (f["pennylane_id"], f["date"], f["numero"], tiers, f["montant"]))
        nb += 1
    return nb


# ------------------------------------------------------------ orchestration

def synchroniser(conn, source, aujourd_hui=None):
    """Synchronisation complète ; renvoie un résumé et l'inscrit au journal."""
    aujourd_hui = aujourd_hui or date.today()
    debut = datetime.now().isoformat(timespec="seconds")
    journal = conn.execute("INSERT INTO journal_sync (debut, statut) VALUES (?, 'en cours')", (debut,)).lastrowid
    conn.commit()
    try:
        resume = {"dossiers": importer_dossiers(conn, source, aujourd_hui), "echeances": 0, "declarations": 0}
        for d in conn.execute("SELECT * FROM dossiers WHERE actif = 1").fetchall():
            if d["pennylane_id"]:
                generes, maj = synchroniser_dossier(conn, source, d, aujourd_hui)
            else:  # dossiers saisis à la main (Bénin, hors Pennylane)
                generes, maj = generer_echeances(conn, d, aujourd_hui), 0
            resume["echeances"] += generes
            resume["declarations"] += maj
        depuis = (aujourd_hui - timedelta(days=400)).isoformat()
        resume["temps"] = importer_temps(conn, source, depuis)
        resume["factures"] = importer_factures(conn, source, depuis)
        message = (f"{resume['dossiers']} dossiers, {resume['echeances']} échéances, "
                   f"{resume['declarations']} déclarations mises à jour, {resume['temps']} temps, "
                   f"{resume['factures']} factures")
        conn.execute("UPDATE journal_sync SET fin = ?, statut = 'ok', message = ? WHERE id = ?",
                     (datetime.now().isoformat(timespec="seconds"), message, journal))
        conn.commit()
        return resume
    except Exception as exc:
        conn.rollback()
        conn.execute("UPDATE journal_sync SET fin = ?, statut = 'erreur', message = ? WHERE id = ?",
                     (datetime.now().isoformat(timespec="seconds"), str(exc)[:500], journal))
        conn.commit()
        raise
