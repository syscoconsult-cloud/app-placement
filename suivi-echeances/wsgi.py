"""Point d'entrée du serveur web en production."""

from app import create_app

application = create_app()
