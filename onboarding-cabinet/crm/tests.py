import tempfile
from unittest import mock

from django.test import TestCase, override_settings

from . import sirene
from .models import Client, Reponse

EXEMPLE_API = {
    "siren": "123456789", "nom_raison_sociale": "EXEMPLE CONSEIL", "nature_juridique": "5710",
    "siege": {"adresse": "1 RUE DE LA PAIX 75002 PARIS"}, "activite_principale": "69.20Z",
    "date_creation": "2020-01-15", "etat_administratif": "A",
    "dirigeants": [{"type_dirigeant": "personne physique", "prenoms": "Jeanne", "nom": "MARTIN", "qualite": "Président de SAS"}],
}


class SireneTests(TestCase):
    def test_extraire(self):
        d = sirene.extraire(EXEMPLE_API)
        self.assertEqual(d["forme_juridique"], "SAS")
        self.assertEqual(d["dirigeants"][0]["nom"], "Jeanne MARTIN")
        self.assertEqual(d["etat"], "Active")

    def test_normaliser(self):
        self.assertEqual(sirene.normaliser_siren("123 456 789 00012"), "123456789")
        with self.assertRaises(sirene.ErreurSirene):
            sirene.normaliser_siren("12")


class ParcoursTests(TestCase):
    def test_creation_fiche_et_questionnaire(self):
        with mock.patch.object(sirene, "rechercher", return_value={**sirene.extraire(EXEMPLE_API), "brut": EXEMPLE_API}):
            self.assertEqual(self.client.get("/api/sirene/123456789/").json()["denomination"], "EXEMPLE CONSEIL")
        rep = self.client.post("/clients/nouveau/", {
            "statut": "prospect", "contact_prenom": "Jeanne", "contact_nom": "Martin",
            "siren": "123456789", "denomination": "EXEMPLE CONSEIL",
        })
        c = Client.objects.get()
        self.assertRedirects(rep, f"/clients/{c.pk}/")
        self.assertEqual(c.donnees_sirene["siren"], "123456789")  # données SIRENE rattachées

        self.assertContains(self.client.get(f"/clients/{c.pk}/"), "Prise de connaissance")
        self.client.post(f"/clients/{c.pk}/questionnaires/prise_de_connaissance/", {
            "outil_comptable": "Pennylane", "effectif": "3", "missions_souhaitees": ["Tenue comptable"],
            "international": "non", "date_demarrage": "2027-01-01", "terminer": "1",
        })
        r = Reponse.objects.get()
        self.assertTrue(r.termine)
        self.assertEqual(r.donnees["outil_comptable"], "Pennylane")
        self.assertEqual(r.donnees["missions_souhaitees"], ["Tenue comptable"])
        # Rechargement : les réponses sont pré-remplies
        self.assertContains(self.client.get(f"/clients/{c.pk}/questionnaires/prise_de_connaissance/"), 'value="Pennylane" selected')

    def test_recherche_liste(self):
        Client.objects.create(contact_prenom="A", contact_nom="Durand", denomination="ALPHA")
        Client.objects.create(contact_prenom="B", contact_nom="Petit", denomination="BETA")
        rep = self.client.get("/?q=alpha")
        self.assertContains(rep, "ALPHA")
        self.assertNotContains(rep, "BETA")
