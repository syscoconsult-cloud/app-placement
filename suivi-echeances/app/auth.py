"""Connexion des collaborateurs et protection des formulaires."""

import functools
import secrets
from datetime import datetime, timedelta

from flask import Blueprint, abort, flash, g, redirect, render_template, request, session, url_for
from werkzeug.security import check_password_hash

from .db import get_db

bp = Blueprint("auth", __name__)


def csrf_token():
    if "csrf" not in session:
        session["csrf"] = secrets.token_urlsafe(32)
    return session["csrf"]


@bp.before_app_request
def charger_utilisateur():
    if request.method == "POST" and request.form.get("csrf") != session.get("csrf"):
        abort(400, "Formulaire expiré : rechargez la page.")
    uid = session.get("user_id")
    g.user = get_db().execute("SELECT * FROM users WHERE id = ? AND actif = 1", (uid,)).fetchone() if uid else None


def connexion_requise(vue):
    @functools.wraps(vue)
    def enveloppe(*args, **kwargs):
        if g.user is None:
            return redirect(url_for("auth.connexion", suite=request.path))
        return vue(*args, **kwargs)
    return enveloppe


def admin_requis(vue):
    @functools.wraps(vue)
    @connexion_requise
    def enveloppe(*args, **kwargs):
        if g.user["role"] != "admin":
            abort(403)
        return vue(*args, **kwargs)
    return enveloppe


LONGUEUR_MINIMALE = 12
ESSAIS_PAR_COMPTE, ESSAIS_PAR_ADRESSE, FENETRE = 5, 20, timedelta(minutes=15)


def controler_mot_de_passe(mot_de_passe):
    """Renvoie un message d'erreur si le mot de passe est trop faible, sinon None."""
    if len(mot_de_passe) < LONGUEUR_MINIMALE:
        return f"Le mot de passe doit contenir au moins {LONGUEUR_MINIMALE} caractères."
    if len(set(mot_de_passe)) < 6:
        return "Le mot de passe est trop simple (trop de caractères répétés)."
    return None


def _trop_d_essais(conn, email, ip):
    depuis = (datetime.now() - FENETRE).isoformat()
    par_compte = conn.execute("SELECT COUNT(*) FROM connexions_echouees WHERE email = ? AND moment > ?",
                              (email, depuis)).fetchone()[0]
    par_adresse = conn.execute("SELECT COUNT(*) FROM connexions_echouees WHERE ip = ? AND moment > ?",
                               (ip, depuis)).fetchone()[0]
    return par_compte >= ESSAIS_PAR_COMPTE or par_adresse >= ESSAIS_PAR_ADRESSE


@bp.route("/connexion", methods=["GET", "POST"])
def connexion():
    if request.method == "POST":
        conn = get_db()
        email, ip = request.form["email"].strip().lower(), request.remote_addr
        if _trop_d_essais(conn, email, ip):
            flash("Trop de tentatives de connexion. Réessayez dans 15 minutes.", "erreur")
            return render_template("connexion.html"), 429
        user = conn.execute("SELECT * FROM users WHERE email = ? AND actif = 1", (email,)).fetchone()
        if user and user["password_hash"] and check_password_hash(user["password_hash"], request.form["mot_de_passe"]):
            conn.execute("DELETE FROM connexions_echouees WHERE email = ? OR moment < ?",
                         (email, (datetime.now() - FENETRE).isoformat()))
            conn.commit()
            session.clear()
            session.permanent = True
            session["user_id"] = user["id"]
            suite = request.args.get("suite", "")
            return redirect(suite if suite.startswith("/") and not suite.startswith("//") else url_for("views.accueil"))
        conn.execute("INSERT INTO connexions_echouees (email, ip, moment) VALUES (?, ?, ?)",
                     (email, ip, datetime.now().isoformat()))
        conn.commit()
        flash("Adresse e-mail ou mot de passe incorrect.", "erreur")
    return render_template("connexion.html")


@bp.route("/deconnexion", methods=["POST"])
def deconnexion():
    session.clear()
    return redirect(url_for("auth.connexion"))
