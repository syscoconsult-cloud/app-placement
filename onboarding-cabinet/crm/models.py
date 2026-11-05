from django.db import models


class Client(models.Model):
    class Statut(models.TextChoices):
        PROSPECT = "prospect", "Prospect"
        EN_COURS = "en_cours", "Onboarding en cours"
        CLIENT = "client", "Client"
        PERDU = "perdu", "Perdu / refusé"

    statut = models.CharField(max_length=20, choices=Statut.choices, default=Statut.PROSPECT)

    # Contact (la personne avec qui vous échangez)
    contact_prenom = models.CharField("prénom", max_length=100)
    contact_nom = models.CharField("nom", max_length=100)
    telephone = models.CharField("téléphone", max_length=30, blank=True)
    email = models.EmailField("e-mail", blank=True)
    fonction = models.CharField("fonction", max_length=100, blank=True)

    # Entité (remplie automatiquement depuis le SIREN quand il existe)
    siren = models.CharField("SIREN", max_length=9, blank=True)
    denomination = models.CharField("dénomination", max_length=255, blank=True)
    forme_juridique = models.CharField("forme juridique", max_length=150, blank=True)
    adresse_siege = models.CharField("adresse du siège", max_length=255, blank=True)
    code_naf = models.CharField("code NAF", max_length=10, blank=True)
    activite = models.CharField("activité", max_length=255, blank=True)
    date_creation = models.DateField("date de création", null=True, blank=True)
    donnees_sirene = models.JSONField("données brutes (API Entreprises)", default=dict, blank=True)

    origine = models.CharField("origine du contact", max_length=150, blank=True,
                               help_text="Recommandation, LinkedIn, TikTok, site web…")
    notes = models.TextField(blank=True)

    cree_le = models.DateTimeField(auto_now_add=True)
    modifie_le = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-modifie_le"]

    def __str__(self):
        return self.denomination or f"{self.contact_prenom} {self.contact_nom}"

    @property
    def contact(self):
        return f"{self.contact_prenom} {self.contact_nom}".strip()


class Echange(models.Model):
    """Historique des appels, rendez-vous et e-mails."""

    class Canal(models.TextChoices):
        APPEL = "appel", "Appel"
        VISIO = "visio", "Visio"
        RDV = "rdv", "Rendez-vous"
        EMAIL = "email", "E-mail"

    client = models.ForeignKey(Client, on_delete=models.CASCADE, related_name="echanges")
    date = models.DateTimeField()
    canal = models.CharField(max_length=10, choices=Canal.choices, default=Canal.APPEL)
    resume = models.TextField("résumé")

    class Meta:
        ordering = ["-date"]


class Reponse(models.Model):
    """Réponses d'un client à un questionnaire (prise de connaissance, LAB, acceptation)."""

    client = models.ForeignKey(Client, on_delete=models.CASCADE, related_name="reponses")
    questionnaire = models.CharField(max_length=50)  # nom du fichier JSON, sans extension
    version = models.CharField(max_length=20, blank=True)
    donnees = models.JSONField(default=dict)
    termine = models.BooleanField("terminé", default=False)
    cree_le = models.DateTimeField(auto_now_add=True)
    modifie_le = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["client", "questionnaire"], name="une_reponse_par_questionnaire")
        ]
