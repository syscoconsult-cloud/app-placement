"""Application de suivi des échéances et de rentabilité du cabinet."""

import os
import sys
from datetime import date

import click
from flask import Flask
from jinja2 import Undefined

# Le moteur de calcul des échéances (echeances.py) est dans le dossier parent.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from . import db  # noqa: E402

CONFIG_ENV = [
    "EDITION", "SECRET_KEY", "DATABASE", "PENNYLANE_TOKEN", "PENNYLANE_BASE_URL", "PENNYLANE_FIRM_ID",
    "PENNYLANE_OWN_COMPANY_ID", "PENNYLANE_ENDPOINTS", "PENNYLANE_FICHIER", "SMTP_HOTE", "SMTP_PORT",
    "SMTP_UTILISATEUR", "SMTP_MOT_DE_PASSE", "SMTP_EXPEDITEUR", "URL_APPLICATION",
]


def create_app(config=None):
    app = Flask(__name__)
    app.config.update(DATABASE=os.path.join(app.instance_path, "echeances.sqlite3"),
                      SESSION_COOKIE_HTTPONLY=True, SESSION_COOKIE_SAMESITE="Lax")
    app.config.update({k: os.environ[k] for k in CONFIG_ENV if os.environ.get(k)})
    app.config.update(config or {})
    from .editions import edition
    app.config["ED"] = edition(app.config.get("EDITION"))
    if not app.config.get("SECRET_KEY"):
        raise RuntimeError("Définissez SECRET_KEY (chaîne aléatoire longue) avant de lancer l'application.")
    os.makedirs(app.instance_path, exist_ok=True)

    with app.app_context():
        conn = db.connect(app.config["DATABASE"])
        db.init_db(conn)
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


def _nombre_saisie(v):
    """Valeur numérique pour un champ de formulaire : 1800000 plutôt que 1800000.0, virgule décimale."""
    if v is None or v == "" or isinstance(v, Undefined):
        return ""
    v = float(v)
    return str(int(v)) if v.is_integer() else str(v).replace(".", ",")


def _commandes(app):
    from .alertes import envoyer_alertes
    from .pennylane import source_depuis_config
    from .sync import synchroniser
    from werkzeug.security import generate_password_hash

    @app.cli.command("synchroniser")
    def cmd_synchroniser():
        """Synchronise les dossiers, déclarations, temps et factures avec Pennylane."""
        if not app.config["ED"]["pennylane"]:
            raise click.ClickException("Cette édition n'est pas connectée à Pennylane.")
        conn = db.connect(app.config["DATABASE"])
        resume = synchroniser(conn, source_depuis_config(app.config))
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
        conn = db.connect(app.config["DATABASE"])
        conn.execute("""INSERT INTO users (email, nom, password_hash, role) VALUES (?, ?, ?, 'admin')
                        ON CONFLICT(email) DO UPDATE SET password_hash = excluded.password_hash,
                        role = 'admin', actif = 1""",
                     (email.strip().lower(), nom, generate_password_hash(password)))
        conn.commit()
        click.echo(f"Administrateur {email} prêt.")
