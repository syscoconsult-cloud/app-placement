"""Écrans de l'application."""

import os
import tempfile
from datetime import date

from flask import Blueprint, abort, current_app, flash, g, redirect, render_template, request, url_for
from werkzeug.security import generate_password_hash

from echeances import MOIS, ajouter_mois

from . import rentabilite
from .alertes import LIBELLES, URGENTS, niveau
from .auth import admin_requis, connexion_requise
from .db import get_db, parametre, set_parametre
from .pennylane import ErreurPennylane, FichierSource, source_depuis_config
from .sync import associer_tiers, generer_echeances, synchroniser

bp = Blueprint("views", __name__)

STATUTS = ["À faire", "En cours", "Fait"]
CATEGORIES = ["Comptable", "Fiscale", "Sociale", "Juridique"]
CHAMPS_DOSSIER = ["nom", "forme", "siren", "cloture", "regime_imposition", "regime_tva", "jour_tva",
                  "effectif", "collaborateur_id", "budget_heures", "honoraires_annuels", "notes"]
CASES_DOSSIER = ["salaries", "cfe", "acompte_cfe", "cvae", "depot_comptes", "actif"]


# Activités proposées à la saisie des temps quand aucune n'est encore définie.
ACTIVITES_DEFAUT = [
    ("1.1", "Saisie et tenue comptable", "Comptabilité"), ("1.2", "Révision et états financiers", "Comptabilité"),
    ("2.1", "Déclarations fiscales", "Fiscal"), ("3.1", "Paie et déclarations sociales", "Social"),
    ("4.1", "Juridique (AG, RCCM)", "Juridique"), ("5.1", "Conseil", "Conseil"),
    ("9.1", "Relances et attente de pièces", "Non productif"), ("9.2", "Corrections et reprises", "Non productif"),
]


def ed():
    return current_app.config["ED"]


def aujourd_hui():
    return current_app.config.get("AUJOURD_HUI") or date.today()


def libelle_mois(mois):
    return f"{MOIS[int(mois[5:7]) - 1].capitalize()} {mois[:4]}"


@bp.app_context_processor
def contexte():
    return {"LIBELLES_ALERTE": LIBELLES, "libelle_mois": libelle_mois}


def enrichir(echeances):
    j = aujourd_hui()
    return [{**dict(e), "niveau": niveau(e, j)} for e in echeances]


def collaborateurs_actifs():
    return get_db().execute("SELECT id, nom FROM users WHERE actif = 1 ORDER BY nom").fetchall()


REQUETE_ECHEANCES = """SELECT e.*, d.nom AS dossier, d.collaborateur_id, u.nom AS collaborateur
                       FROM echeances e JOIN dossiers d ON d.id = e.dossier_id
                       LEFT JOIN users u ON u.id = d.collaborateur_id WHERE d.actif = 1"""


# ------------------------------------------------------------ tableau de bord

@bp.route("/")
@connexion_requise
def accueil():
    conn, j = get_db(), aujourd_hui()
    tous = request.args.get("tous") == "1" or g.user["role"] == "admin" and request.args.get("tous") != "0"
    filtre, params = ("", []) if tous else (" AND d.collaborateur_id = ?", [g.user["id"]])
    a_traiter = enrichir(conn.execute(
        REQUETE_ECHEANCES + filtre + """ AND e.statut != 'Fait'
        AND (e.date_limite <= date(?, '+30 days') OR e.anomalie IS NOT NULL) ORDER BY e.date_limite""",
        params + [j.isoformat()]).fetchall())
    mois = j.strftime("%Y-%m")
    du_mois = conn.execute(REQUETE_ECHEANCES + filtre + " AND substr(e.date_limite, 1, 7) = ?",
                           params + [mois]).fetchall()
    compteurs = {
        "retard": sum(e["niveau"] in URGENTS for e in a_traiter),
        "proche": sum(e["niveau"] == "proche" for e in a_traiter),
        "mois_total": len(du_mois),
        "mois_faits": sum(e["statut"] == "Fait" for e in du_mois),
    }
    derniere_sync = conn.execute("SELECT * FROM journal_sync ORDER BY id DESC LIMIT 1").fetchone()
    return render_template("accueil.html", echeances=a_traiter, compteurs=compteurs, tous=tous,
                           mois=mois, derniere_sync=derniere_sync)


# ------------------------------------------------------------ échéances

@bp.route("/echeances")
@connexion_requise
def echeances():
    conn = get_db()
    mois = request.args.get("mois") or aujourd_hui().strftime("%Y-%m")
    f = {k: request.args.get(k, "") for k in ("dossier", "collaborateur", "categorie", "statut", "alerte")}
    sql, params = REQUETE_ECHEANCES, []
    if f["alerte"] != "retard":  # la vue « en retard » couvre tous les mois
        sql += " AND substr(e.date_limite, 1, 7) = ?"
        params.append(mois)
    for champ, colonne in (("dossier", "e.dossier_id"), ("collaborateur", "d.collaborateur_id"),
                           ("categorie", "e.categorie"), ("statut", "e.statut")):
        if f[champ]:
            sql += f" AND {colonne} = ?"
            params.append(f[champ])
    lignes = enrichir(conn.execute(sql + " ORDER BY e.date_limite, d.nom", params).fetchall())
    if f["alerte"] == "retard":  # les anomalies sont aussi urgentes que les retards
        lignes = [l for l in lignes if l["niveau"] in URGENTS]
    elif f["alerte"]:
        lignes = [l for l in lignes if l["niveau"] == f["alerte"]]
    premier = date(int(mois[:4]), int(mois[5:7]), 1)
    return render_template(
        "echeances.html", echeances=lignes, mois=mois, filtres=f,
        mois_prec=ajouter_mois(premier, -1).strftime("%Y-%m"), mois_suiv=ajouter_mois(premier, 1).strftime("%Y-%m"),
        dossiers=conn.execute("SELECT id, nom FROM dossiers WHERE actif = 1 ORDER BY nom").fetchall(),
        collaborateurs=collaborateurs_actifs(), statuts=STATUTS, categories=CATEGORIES)


@bp.route("/echeances/<int:echeance_id>", methods=["POST"])
@connexion_requise
def maj_echeance(echeance_id):
    conn = get_db()
    statut = request.form["statut"]
    if statut not in STATUTS:
        flash("Statut inconnu.", "erreur")
        return redirect(request.referrer or url_for("views.echeances"))
    realisation = request.form.get("date_realisation") or (aujourd_hui().isoformat() if statut == "Fait" else None)
    conn.execute("""UPDATE echeances SET statut = ?, date_realisation = ?, commentaire = ?,
                    anomalie = CASE WHEN ? = 'Fait' THEN NULL ELSE anomalie END WHERE id = ?""",
                 (statut, realisation if statut == "Fait" else None,
                  request.form.get("commentaire") or None, statut, echeance_id))
    conn.commit()
    flash("Échéance mise à jour.", "ok")
    return redirect(request.referrer or url_for("views.echeances"))


# ------------------------------------------------------------ dossiers

@bp.route("/dossiers")
@connexion_requise
def dossiers():
    j = aujourd_hui().isoformat()
    lignes = get_db().execute(
        """SELECT d.*, u.nom AS collaborateur,
                  (SELECT COUNT(*) FROM echeances e WHERE e.dossier_id = d.id AND e.statut != 'Fait'
                     AND (e.date_limite < ? OR e.anomalie IS NOT NULL)) AS en_retard,
                  (SELECT MIN(date_limite) FROM echeances e WHERE e.dossier_id = d.id AND e.statut != 'Fait'
                     AND e.date_limite >= ?) AS prochaine
           FROM dossiers d LEFT JOIN users u ON u.id = d.collaborateur_id
           ORDER BY d.actif DESC, d.nom""", (j, j)).fetchall()
    return render_template("dossiers.html", dossiers=lignes)


def _formulaire_dossier():
    valeurs = {k: (request.form.get(k) or None) for k in CHAMPS_DOSSIER}
    valeurs.update({k: int(bool(request.form.get(k))) for k in CASES_DOSSIER})
    for k in ("jour_tva", "effectif", "collaborateur_id"):
        valeurs[k] = int(valeurs[k]) if valeurs[k] else None
    for k in ("budget_heures", "honoraires_annuels"):
        valeurs[k] = float(valeurs[k].replace(",", ".")) if valeurs[k] else None
    if not valeurs["nom"]:
        raise ValueError("Le nom du dossier est obligatoire.")
    return valeurs


def _options_dossier():
    return {"formes": ed()["formes"], "regimes_imposition": ed()["regimes_imposition"],
            "regimes_tva": ed()["regimes_tva"], "collaborateurs": collaborateurs_actifs()}


@bp.route("/dossiers/nouveau", methods=["GET", "POST"])
@connexion_requise
def nouveau_dossier():
    conn = get_db()
    if request.method == "POST":
        try:
            v = _formulaire_dossier()
        except ValueError as exc:
            flash(str(exc), "erreur")
            return render_template("dossier.html", dossier=request.form, echeances=[], **_options_dossier())
        colonnes = CHAMPS_DOSSIER + CASES_DOSSIER + ["pays", "suivi_depuis"]
        v["pays"], v["suivi_depuis"] = ed()["pays"], aujourd_hui().isoformat()
        dossier_id = conn.execute(f"INSERT INTO dossiers ({', '.join(colonnes)}) VALUES ({', '.join('?' * len(colonnes))})",
                                  [v[c] for c in colonnes]).lastrowid
        generer_echeances(conn, conn.execute("SELECT * FROM dossiers WHERE id = ?", (dossier_id,)).fetchone(),
                          aujourd_hui())
        conn.commit()
        flash("Dossier créé et échéances générées.", "ok")
        return redirect(url_for("views.dossier", dossier_id=dossier_id))
    vide = {"cfe": 1, "depot_comptes": 1, "actif": 1, "collaborateur_id": g.user["id"],
            "regime_imposition": "IS", "jour_tva": ed()["jour_tva_defaut"]}
    return render_template("dossier.html", dossier=vide, echeances=[], **_options_dossier())


@bp.route("/dossiers/<int:dossier_id>", methods=["GET", "POST"])
@connexion_requise
def dossier(dossier_id):
    conn = get_db()
    d = conn.execute("SELECT * FROM dossiers WHERE id = ?", (dossier_id,)).fetchone()
    if d is None:
        return redirect(url_for("views.dossiers"))
    if request.method == "POST":
        try:
            v = _formulaire_dossier()
        except ValueError as exc:
            flash(str(exc), "erreur")
            return redirect(url_for("views.dossier", dossier_id=dossier_id))
        colonnes = CHAMPS_DOSSIER + CASES_DOSSIER
        conn.execute(f"UPDATE dossiers SET {', '.join(c + ' = ?' for c in colonnes)} WHERE id = ?",
                     [v[c] for c in colonnes] + [dossier_id])
        d = conn.execute("SELECT * FROM dossiers WHERE id = ?", (dossier_id,)).fetchone()
        if d["actif"]:
            generer_echeances(conn, d, aujourd_hui())
        conn.commit()
        flash("Dossier enregistré, échéances recalculées.", "ok")
        return redirect(url_for("views.dossier", dossier_id=dossier_id))
    lignes = enrichir(conn.execute(
        REQUETE_ECHEANCES.replace("WHERE d.actif = 1", "WHERE 1 = 1") + " AND e.dossier_id = ? ORDER BY e.date_limite",
        (dossier_id,)).fetchall())
    return render_template("dossier.html", dossier=d, echeances=lignes, **_options_dossier())


# ------------------------------------------------------------ rentabilité

@bp.route("/rentabilite")
@admin_requis
def page_rentabilite():
    conn = get_db()
    defaut = ajouter_mois(aujourd_hui().replace(day=1), -1).strftime("%Y-%m")
    mois = request.args.get("mois") or defaut
    cumul = request.args.get("cumul") == "1"
    ca_mode = request.args.get("ca", "facture")
    lignes, totaux, collaborateurs, non_rapproches, (debut, fin) = rentabilite.calculer(conn, mois, cumul, ca_mode)
    sans_taux = conn.execute("""SELECT COUNT(*) FROM users WHERE actif = 1 AND taux_horaire IS NULL
                                AND id IN (SELECT DISTINCT user_id FROM temps)""").fetchone()[0]
    return render_template("rentabilite.html", lignes=lignes, totaux=totaux, collaborateurs=collaborateurs,
                           non_rapproches=non_rapproches, mois=mois, cumul=cumul, ca_mode=ca_mode,
                           debut=debut, fin=fin, sans_taux=sans_taux,
                           factures_ttc=parametre(conn, "factures_ttc", "0") == "1")


# ------------------------------------------------------------ collaborateurs

@bp.route("/collaborateurs", methods=["GET", "POST"])
@admin_requis
def collaborateurs():
    conn = get_db()
    if request.method == "POST":
        uid = request.form.get("id")
        taux = request.form.get("taux_horaire", "").replace(",", ".")
        valeurs = (request.form["nom"].strip(), request.form["email"].strip().lower(),
                   request.form.get("role", "collaborateur"), float(taux) if taux else None,
                   int(bool(request.form.get("actif"))))
        if uid:
            conn.execute("UPDATE users SET nom = ?, email = ?, role = ?, taux_horaire = ?, actif = ? WHERE id = ?",
                         valeurs + (int(uid),))
        else:
            uid = conn.execute("INSERT INTO users (nom, email, role, taux_horaire, actif) VALUES (?, ?, ?, ?, ?)",
                               valeurs).lastrowid
        if request.form.get("mot_de_passe"):
            conn.execute("UPDATE users SET password_hash = ? WHERE id = ?",
                         (generate_password_hash(request.form["mot_de_passe"]), int(uid)))
        conn.commit()
        flash("Collaborateur enregistré.", "ok")
        return redirect(url_for("views.collaborateurs"))
    return render_template("collaborateurs.html",
                           users=conn.execute("SELECT * FROM users ORDER BY actif DESC, nom").fetchall())


# ------------------------------------------------------------ paramètres et synchronisation

@bp.route("/parametres", methods=["GET", "POST"])
@admin_requis
def parametres():
    conn = get_db()
    if request.method == "POST":
        if ed()["pennylane"]:
            set_parametre(conn, "factures_ttc", "1" if request.form.get("factures_ttc") else "0")
        if request.form.get("nouvelle_activite_code"):
            conn.execute("INSERT OR IGNORE INTO activites (code, nom, groupe) VALUES (?, ?, ?)",
                         (request.form["nouvelle_activite_code"].strip(), request.form.get("nouvelle_activite_nom"),
                          request.form.get("nouvelle_activite_groupe")))
        perdues = set(request.form.getlist("temps_perdu"))
        for a in conn.execute("SELECT code FROM activites").fetchall():
            conn.execute("UPDATE activites SET temps_perdu = ? WHERE code = ?", (int(a["code"] in perdues), a["code"]))
        for cle, valeur in request.form.items():
            if cle.startswith("tiers:"):
                conn.execute("UPDATE tiers SET dossier_id = ? WHERE nom_normalise = ?",
                             (int(valeur) if valeur else None, cle[6:]))
        conn.commit()
        flash("Paramètres enregistrés.", "ok")
        return redirect(url_for("views.parametres"))
    return render_template(
        "parametres.html",
        factures_ttc=parametre(conn, "factures_ttc", "0") == "1",
        activites=activites(conn),
        tiers=conn.execute("SELECT * FROM tiers ORDER BY dossier_id IS NOT NULL, nom").fetchall(),
        dossiers=conn.execute("SELECT id, nom FROM dossiers ORDER BY nom").fetchall(),
        journal=conn.execute("SELECT * FROM journal_sync ORDER BY id DESC LIMIT 10").fetchall(),
        api_configuree=bool(current_app.config.get("PENNYLANE_TOKEN") or current_app.config.get("PENNYLANE_FICHIER")))


@bp.route("/synchroniser", methods=["POST"])
@admin_requis
def lancer_synchronisation():
    if not ed()["pennylane"]:
        abort(404)
    conn = get_db()
    fichier = request.files.get("fichier")
    chemin = None
    try:
        if fichier and fichier.filename:
            fd, chemin = tempfile.mkstemp(suffix=".json")
            os.close(fd)
            fichier.save(chemin)
            source = FichierSource(chemin)
        else:
            source = source_depuis_config(current_app.config)
        resume = synchroniser(conn, source, aujourd_hui())
        flash(f"Synchronisation terminée : {resume['dossiers']} dossiers, {resume['declarations']} déclarations "
              f"mises à jour, {resume['temps']} temps, {resume['factures']} factures.", "ok")
    except (ErreurPennylane, ValueError, KeyError) as exc:
        flash(f"Échec de la synchronisation : {exc}", "erreur")
    finally:
        if chemin:
            os.remove(chemin)
    return redirect(url_for("views.parametres"))


# ------------------------------------------------------------ saisie manuelle (édition sans Pennylane)

def activites(conn):
    if ed()["saisie_manuelle"] and not conn.execute("SELECT 1 FROM activites LIMIT 1").fetchone():
        conn.executemany("INSERT INTO activites (code, nom, groupe) VALUES (?, ?, ?)", ACTIVITES_DEFAUT)
        conn.commit()
    return conn.execute("SELECT * FROM activites ORDER BY code").fetchall()


def saisie_manuelle(vue):
    """Réserve un écran à l'édition sans Pennylane (temps et honoraires saisis ici)."""
    def enveloppe(*args, **kwargs):
        if not ed()["saisie_manuelle"]:
            abort(404)
        return vue(*args, **kwargs)
    enveloppe.__name__ = vue.__name__
    return enveloppe


def _dossier_actif(conn, dossier_id):
    d = conn.execute("SELECT * FROM dossiers WHERE id = ? AND actif = 1", (dossier_id,)).fetchone()
    if d is None:
        raise ValueError("Dossier inconnu.")
    return d


def _nombre(texte, libelle):
    try:
        valeur = float((texte or "").replace(",", ".").replace(" ", "").replace("\u202f", ""))
    except ValueError:
        raise ValueError(f"{libelle} invalide.") from None
    if valeur == 0:
        raise ValueError(f"{libelle} obligatoire.")
    return valeur


@bp.route("/temps", methods=["GET", "POST"])
@connexion_requise
@saisie_manuelle
def temps():
    conn = get_db()
    if request.method == "POST":
        try:
            d = _dossier_actif(conn, int(request.form["dossier_id"]))
            heures = _nombre(request.form.get("heures"), "Durée")
            if heures < 0 or heures > 24:
                raise ValueError("La durée doit être comprise entre 0 et 24 heures.")
            a = conn.execute("SELECT * FROM activites WHERE code = ?", (request.form.get("activite_code"),)).fetchone()
            if a is None:
                raise ValueError("Activité inconnue.")
            jour = date.fromisoformat(request.form["date"]).isoformat()
        except (ValueError, KeyError) as exc:
            flash(str(exc) or "Saisie incomplète.", "erreur")
            return redirect(url_for("views.temps"))
        conn.execute(
            """INSERT INTO temps (date, user_id, collaborateur, tiers, activite_code, activite_nom, mission,
               facturable, duree_s, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (jour, g.user["id"], g.user["nom"], associer_tiers(conn, d["nom"], d["id"]), a["code"], a["nom"],
             a["groupe"], int(bool(request.form.get("facturable"))), round(heures * 3600),
             request.form.get("description") or None))
        conn.commit()
        flash("Temps enregistré.", "ok")
        return redirect(url_for("views.temps", date=jour, dossier=d["id"]))
    tous = g.user["role"] == "admin" and request.args.get("tous") == "1"
    lignes = conn.execute(
        """SELECT tp.*, d.nom AS dossier FROM temps tp LEFT JOIN tiers ti ON ti.nom_normalise = tp.tiers
           LEFT JOIN dossiers d ON d.id = ti.dossier_id WHERE tp.date >= date(?, '-60 days')"""
        + ("" if tous else " AND tp.user_id = ?") + " ORDER BY tp.date DESC, tp.id DESC",
        (aujourd_hui().isoformat(),) if tous else (aujourd_hui().isoformat(), g.user["id"])).fetchall()
    return render_template(
        "temps.html", lignes=lignes, tous=tous, activites=activites(conn),
        dossiers=conn.execute("SELECT id, nom FROM dossiers WHERE actif = 1 ORDER BY nom").fetchall(),
        date_defaut=request.args.get("date") or aujourd_hui().isoformat(),
        dossier_defaut=request.args.get("dossier", type=int))


@bp.route("/temps/<int:temps_id>/supprimer", methods=["POST"])
@connexion_requise
@saisie_manuelle
def supprimer_temps(temps_id):
    conn = get_db()
    conn.execute("DELETE FROM temps WHERE id = ? AND pennylane_id IS NULL AND (user_id = ? OR ? = 'admin')",
                 (temps_id, g.user["id"], g.user["role"]))
    conn.commit()
    flash("Temps supprimé.", "ok")
    return redirect(request.referrer or url_for("views.temps"))


@bp.route("/honoraires", methods=["GET", "POST"])
@admin_requis
@saisie_manuelle
def factures():
    conn = get_db()
    if request.method == "POST":
        try:
            d = _dossier_actif(conn, int(request.form["dossier_id"]))
            montant = _nombre(request.form.get("montant"), "Montant")
            jour = date.fromisoformat(request.form["date"]).isoformat()
        except (ValueError, KeyError) as exc:
            flash(str(exc) or "Saisie incomplète.", "erreur")
            return redirect(url_for("views.factures"))
        conn.execute("INSERT INTO factures (date, numero, tiers, montant) VALUES (?, ?, ?, ?)",
                     (jour, request.form.get("numero") or None, associer_tiers(conn, d["nom"], d["id"]), montant))
        conn.commit()
        flash("Facture enregistrée.", "ok")
        return redirect(url_for("views.factures"))
    lignes = conn.execute(
        """SELECT f.*, d.nom AS dossier FROM factures f LEFT JOIN tiers ti ON ti.nom_normalise = f.tiers
           LEFT JOIN dossiers d ON d.id = ti.dossier_id ORDER BY f.date DESC, f.id DESC LIMIT 200""").fetchall()
    return render_template(
        "factures.html", lignes=lignes, date_defaut=aujourd_hui().isoformat(),
        dossiers=conn.execute("SELECT id, nom FROM dossiers WHERE actif = 1 ORDER BY nom").fetchall())


@bp.route("/honoraires/<int:facture_id>/supprimer", methods=["POST"])
@admin_requis
@saisie_manuelle
def supprimer_facture(facture_id):
    conn = get_db()
    conn.execute("DELETE FROM factures WHERE id = ? AND pennylane_id IS NULL", (facture_id,))
    conn.commit()
    flash("Facture supprimée.", "ok")
    return redirect(url_for("views.factures"))
