"""
Réglages de l'outil d'onboarding du cabinet.

Toutes les données (base, pièces clients, lettres de mission) sont rangées
dans un dossier OneDrive, et non dans le dossier du programme :
    <OneDrive>/Cabinet - Onboarding/

Ce dossier peut être changé avec la variable d'environnement
ONBOARDING_DATA_DIR.
"""

import os
import secrets
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent


def _dossier_donnees() -> Path:
    """Trouve le dossier OneDrive (professionnel en priorité) sous Windows."""
    if os.environ.get("ONBOARDING_DATA_DIR"):
        return Path(os.environ["ONBOARDING_DATA_DIR"])
    for var in ("OneDriveCommercial", "OneDrive"):
        if os.environ.get(var):
            return Path(os.environ[var]) / "Cabinet - Onboarding"
    # Hors Windows / sans OneDrive : dossier local (développement)
    return BASE_DIR / "donnees-dev"


DATA_DIR = _dossier_donnees()
DOSSIER_BASE = DATA_DIR / "Base"
DOSSIER_PIECES = DATA_DIR / "Pieces clients"
DOSSIER_LETTRES = DATA_DIR / "Lettres de mission"
for _d in (DOSSIER_BASE, DOSSIER_PIECES, DOSSIER_LETTRES):
    _d.mkdir(parents=True, exist_ok=True)

# Clé secrète générée une fois et conservée avec la base.
_fichier_cle = DOSSIER_BASE / ".cle_secrete"
if not _fichier_cle.exists():
    _fichier_cle.write_text(secrets.token_urlsafe(50), encoding="utf-8")
SECRET_KEY = _fichier_cle.read_text(encoding="utf-8").strip()

# Application locale : n'écoute que sur l'ordinateur lui-même.
DEBUG = os.environ.get("ONBOARDING_DEBUG") == "1"
ALLOWED_HOSTS = ["127.0.0.1", "localhost"]

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "crm",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "cabinet.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "cabinet.wsgi.application"

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": DOSSIER_BASE / "onboarding.sqlite3",
    }
}

AUTH_PASSWORD_VALIDATORS = []

LANGUAGE_CODE = "fr-fr"
TIME_ZONE = "Europe/Paris"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# Questionnaires (fichiers JSON modifiables sans toucher au code)
DOSSIER_QUESTIONNAIRES = BASE_DIR / "questionnaires"
