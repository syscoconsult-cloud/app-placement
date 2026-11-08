"""Application de suivi des échéances et de rentabilité du cabinet."""

import os
import sys
from datetime import date, timedelta

import click
from flask import Flask
from jinja2 import Undefined
from werkzeug.middleware.proxy_fix import ProxyFix

# Le moteur de calcul des échéances (echeances.py) est dans le dossier parent.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from . import db  # noqa: E402

CONFIG_ENV = [
    "EDITION", "SECRET_KEY", "DATABASE", "PENNYLANE_TOKEN", "PENNYLANE_BASE_URL", "PENNYLANE_FIRM_ID",
    "PENNYLANE_OWN_COMPANY_ID", "PENNYLANE_ENDPOINTS", "PENNYLANE_FICHIER", "SMTP_HOTE", "SMTP_PORT",
    "SMTP_UTILISATEUR", "SMTP_MOT_DE_PASSE", "SMTP_EXPEDITEUR", "URL_APPLICATION",
    "ADMIN_EMAIL", "ADMIN_NOM", "ADMIN_MOT_DE_PASSE",
]


def create_app(config=None):
    app = Flask(__name__)
    app.config.update(DATABASE=os.path.join(app.instance_path, "echeances.sqlite3"),
                      SESSION_COOKIE_HTTPONLY=True, SESSION_COOKIE_SAMESITE="Lax")
    app.config.update({k: os.environ[k] for k in CONFIG_ENV if os.environ.get(k)})
    # Base PostgreSQL gérée par l'hébergeur (Clever Cloud la fournit dans POSTGRESQL_ADDON_URI).
    for variable in ("DATABASE_URL", "POSTGRESQL_ADDON_URI"):
        if os.environ.get(variable) and not os.environ.get("DATABASE"):
            app.config["DATABASE"] = os.environ[variable]
    app.config.update(config or {})
    from .editions import edition
    app.config["ED"] = edition(app.config.get("EDITION"))
    if not app.config.get("SECRET_KEY"):
        raise RuntimeError("Définissez SECRET_KEY (chaîne aléatoire longue) avant de lancer l'application.")
    os.makedirs(app.instance_path, exist_ok=True)

    # En ligne (adresse en https), cookies réservés au HTTPS et protocole relayé par l'hébergeur.
    en_ligne = str(app.config.get("URL_APPLICATION", "")).startswith("https://")
    app.config.update(SESSION_COOKIE_SECURE=en_ligne, PREFERRED_URL_SCHEME="https" if en_ligne else "http",
                      PERMANENT_SESSION_LIFETIME=timedelta(hours=4))  # déconnexion après 4 h d'inactivité
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1)

    @app.after_request
    def entetes_securite(reponse):
        reponse.headers.setdefault("X-Frame-Options", "DENY")
        reponse.headers.setdefault("X-Content-Type-Options", "nosniff")
        reponse.headers.setdefault("Referrer-Policy", "same-origin")
        reponse.headers.setdefault("Content-Security-Policy",
                                   "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; "
                                   "frame-ancestors 'none'; form-action 'self'")
        if en_ligne:
            reponse.headers.setdefault("Strict-Transport-Security", "max-age=31536000")
        return reponse

    with app.app_context():
        conn = db.connect(app.config["DATABASE"])
        db.init_db(conn)
        _premier_administrateur(conn, app.config)
        conn.close()

    app.teardown_appcontext(db.close_db)

    from . import auth, views
    app.register_blueprint(auth.bp)
    app.register_blueprint(views.bp)
    app.jinja_env.globals["csrf_token"] = auth.csrf_token
    app.jinja_env.globals["ed"] = app.config["ED"]
    app.jinja_env.filters["date_fr"] = lambda s: date.fromisoformat(s[:10]).strftime("%d/%m/%Y") if s else ""
    monnaie = app.config["ED"]["monnaie"]
    app.jinja_env.filters["monnaie"] = lambda v: "—" if v is None else f"{v:,.0f} {monnaie}".replace(",", "\u202f")
    app.jinja_env.filters["heures"] = (
        lambda v: "—" if v is None else f"{v:,.1f} h".replace(",", "\u202f").replace(".", ","))
    app.jinja_env.filters["nombre_saisie"] = _nombre_saisie
    app.jinja_env.filters["horodatage"] = lambda s: f"{s[8:10]}/{s[5:7]}/{s[:4]} à {s[11:16]}" if s else ""

    _commandes(app)
    return app


def _premier_administrateur(conn, config):
    """Crée le premier compte administrateur à partir des réglages de l'hébergeur
    (ADMIN_EMAIL, ADMIN_MOT_DE_PASSE), seulement s'il n'existe encore aucun administrateur."""
    from werkzeug.security import generate_password_hash
    from .auth import controler_mot_de_passe
    email, mot_de_passe = config.get("ADMIN_EMAIL"), config.get("ADMIN_MOT_DE_PASSE")
    if not (email and mot_de_passe) or conn.execute("SELECT 1 FROM users WHERE role = 'admin'").fetchone():
        return
    erreur = controler_mot_de_passe(mot_de_passe)
    if erreur:
        raise RuntimeError(f"ADMIN_MOT_DE_PASSE refusé : {erreur}")
    conn.execute("""INSERT INTO users (email, nom, password_hash, role) VALUES (?, ?, ?, 'admin')
                    ON CONFLICT (email) DO UPDATE SET password_hash = excluded.password_hash, role = 'admin', actif = 1""",
                 (email.strip().lower(), config.get("ADMIN_NOM") or email, generate_password_hash(mot_de_passe)))
    conn.commit()


def _nombre_saisie(v):
    """Valeur numérique pour un champ de formulaire : 1800000 plutôt que 1800000.0, virgule décimale."""
    if v is None or v == "" or isinstance(v, Undefined):
        return ""
    v = float(v)
    return str(int(v)) if v.is_integer() else str(v).replace(".", ",")


def _commandes(app):
    from .alertes import envoyer_alertes, prevenir_administrateurs
    from .pennylane import source_depuis_config
    from .sync import synchroniser
    from werkzeug.security import generate_password_hash

    @app.cli.command("synchroniser")
    def cmd_synchroniser():
        """Synchronise les dossiers, déclarations, temps et factures avec Pennylane."""
        if not app.config["ED"]["pennylane"]:
            click.echo("Cette édition n'est pas connectée à Pennylane : rien à synchroniser.")
            return
        conn = db.connect(app.config["DATABASE"])
        try:
            resume = synchroniser(conn, source_depuis_config(app.config))
        except Exception as exc:
            prevenir_administrateurs(
                conn, app.config, "Échéances France : la synchronisation Pennylane a échoué",
                f"La synchronisation de cette nuit avec Pennylane a échoué :\n\n{exc}\n\n"
                "Les statuts de déclaration, les temps et les factures n'ont pas été mis à jour. "
                "Le détail figure dans Paramètres > Dernières synchronisations.")
            raise click.ClickException(f"Échec de la synchronisation : {exc}") from exc
        click.echo(f"Synchronisation terminée : {resume}")

    @app.cli.command("alertes")
    @click.option("--simulation", is_flag=True, help="Affiche les e-mails sans les envoyer.")
    def cmd_alertes(simulation):
        """Envoie le récapitulatif quotidien des échéances en retard ou proches."""
        conn = db.connect(app.config["DATABASE"])
        messages = envoyer_alertes(conn, app.config, simulation=simulation)
        for m in messages:
            click.echo(f"--- À : {m['To']} | {m['Subject']}\n{m.get_content()}" if simulation else f"Envoyé à {m['To']}")
        click.echo(f"{len(messages)} e-mail(s).")

    @app.cli.command("creer-admin")
    @click.option("--email", prompt=True)
    @click.option("--nom", prompt=True)
    @click.password_option()
    def cmd_creer_admin(email, nom, password):
        """Crée (ou réactive) un compte administrateur."""
        from .auth import controler_mot_de_passe
        erreur = controler_mot_de_passe(password)
        if erreur:
            raise click.ClickException(erreur)
        conn = db.connect(app.config["DATABASE"])
        conn.execute("""INSERT INTO users (email, nom, password_hash, role) VALUES (?, ?, ?, 'admin')
                        ON CONFLICT(email) DO UPDATE SET password_hash = excluded.password_hash,
                        role = 'admin', actif = 1""",
                     (email.strip().lower(), nom, generate_password_hash(password)))
        conn.commit()
        click.echo(f"Administrateur {email} prêt.")
