"""Installation de l'application chez alwaysdata, à lancer une fois en SSH :

    python3 ~/app-placement/suivi-echeances/hebergement/installer_alwaysdata.py

Le script crée l'environnement Python, installe les dépendances, écrit les réglages
dans instance/config.env (lisible par vous seul), prépare la base PostgreSQL et crée
votre compte administrateur. Les mots de passe sont tapés ici, dans le terminal
alwaysdata, et ne sont jamais affichés.

On peut le relancer sans risque : il propose de garder les réglages existants.
"""

import getpass
import os
import secrets
import subprocess
import sys
from urllib.parse import quote

APP = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VENV = os.path.join(APP, ".venv")
PY = os.path.join(VENV, "bin", "python")
CONFIG = os.path.join(APP, "instance", "config.env")
COMPTE = getpass.getuser()


def demander(question, defaut=""):
    rep = input(f"{question}{f' [{defaut}]' if defaut else ''} : ").strip()
    return rep or defaut


def secret(question):
    while True:
        rep = getpass.getpass(f"{question} (rien ne s'affiche, c'est normal) : ").strip()
        if rep:
            return rep
        print("  Valeur obligatoire.")


def etape(titre):
    print(f"\n=== {titre} ===")


def lancer(*args, **kw):
    subprocess.run(args, cwd=APP, check=True, **kw)


def main():
    if sys.version_info < (3, 10):
        sys.exit("Python 3.10 ou plus récent est nécessaire (choisissez une version récente dans alwaysdata).")

    etape("1/4 Environnement Python")
    if not os.path.exists(PY):
        lancer(sys.executable, "-m", "venv", VENV)
    lancer(PY, "-m", "pip", "install", "--quiet", "--upgrade", "pip")
    lancer(PY, "-m", "pip", "install", "--quiet", "-r", "requirements.txt")
    print("Dépendances installées.")

    etape("2/4 Réglages")
    garder = os.path.exists(CONFIG) and demander("Des réglages existent déjà. Les garder ? (o/n)", "o").lower().startswith("o")
    if not garder:
        edition = demander("Application « benin » ou « france »", "benin")
        url = demander("Adresse de l'application", f"https://{COMPTE}.alwaysdata.net")
        print("\nBase PostgreSQL (menu Bases de données > PostgreSQL de l'administration alwaysdata)")
        hote = demander("  Hôte", f"postgresql-{COMPTE}.alwaysdata.net")
        base = demander("  Nom de la base", f"{COMPTE}_echeances")
        utilisateur = demander("  Utilisateur", COMPTE)
        mdp = secret("  Mot de passe de cet utilisateur")
        print("\nEnvoi des alertes par e-mail (Gmail : mot de passe d'application, pas votre mot de passe habituel)")
        smtp_hote = demander("  Serveur d'envoi", "smtp.gmail.com")
        smtp_port = demander("  Port", "587")
        smtp_user = demander("  Adresse e-mail d'envoi", "syscoconsult@gmail.com")
        smtp_mdp = secret("  Mot de passe d'application")
        lignes = [
            "# Réglages de l'application — fichier privé, ne pas partager.",
            f"EDITION={edition}",
            f"SECRET_KEY={secrets.token_urlsafe(48)}",
            f"URL_APPLICATION={url}",
            f"DATABASE=postgresql://{quote(utilisateur, safe='')}:{quote(mdp, safe='')}@{hote}:5432/{quote(base, safe='')}",
            f"SMTP_HOTE={smtp_hote}",
            f"SMTP_PORT={smtp_port}",
            f"SMTP_UTILISATEUR={smtp_user}",
            f"SMTP_MOT_DE_PASSE={smtp_mdp}",
            f"SMTP_EXPEDITEUR={smtp_user}",
        ]
        os.makedirs(os.path.dirname(CONFIG), exist_ok=True)
        fd = os.open(CONFIG, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write("\n".join(lignes) + "\n")
    os.chmod(CONFIG, 0o600)
    print(f"Réglages enregistrés dans {CONFIG} (lisible par vous seul).")

    etape("3/4 Base de données")
    lancer(PY, "-c", "from app import create_app; create_app(); print('Base de données prête.')")

    etape("4/4 Votre compte administrateur (mot de passe de 12 caractères minimum)")
    lancer(PY, "-m", "flask", "--app", "app", "creer-admin")

    print(f"""
=== Installation terminée ===

Dans l'administration alwaysdata, menu Web > Sites, réglez le site ainsi :
  Type                     : Python WSGI
  Chemin de l'application  : {os.path.join(APP, 'wsgi.py')}
  Répertoire de travail    : {APP}
  Environnement virtuel    : {VENV}

Puis, menu Avancé > Tâches planifiées, ajoutez une tâche de type « Commande » :
  Commande   : cd {APP} && {PY} -m flask --app app alertes
  Fréquence  : 45 7 * * 1-5   (7 h 45, du lundi au vendredi)

Pour vérifier les e-mails sans les envoyer :
  cd {APP} && {PY} -m flask --app app alertes --simulation
""")


if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError as exc:
        sys.exit(f"\nUne étape a échoué ({exc}). Copiez le message ci-dessus et envoyez-le à Claude.")
    except KeyboardInterrupt:
        sys.exit("\nInstallation interrompue.")
