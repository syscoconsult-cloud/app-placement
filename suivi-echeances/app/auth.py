"""Connexion des collaborateurs et protection des formulaires."""

import functools
import secrets

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


@bp.route("/connexion", methods=["GET", "POST"])
def connexion():
    if request.method == "POST":
        user = get_db().execute("SELECT * FROM users WHERE email = ? AND actif = 1",
                                (request.form["email"].strip().lower(),)).fetchone()
        if user and user["password_hash"] and check_password_hash(user["password_hash"], request.form["mot_de_passe"]):
            session.clear()
            session["user_id"] = user["id"]
            suite = request.args.get("suite", "")
            return redirect(suite if suite.startswith("/") and not suite.startswith("//") else url_for("views.accueil"))
        flash("Adresse e-mail ou mot de passe incorrect.", "erreur")
    return render_template("connexion.html")


@bp.route("/deconnexion", methods=["POST"])
def deconnexion():
    session.clear()
    return redirect(url_for("auth.connexion"))
