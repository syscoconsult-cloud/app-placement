from django import forms

from .models import Client, Echange


class ClientForm(forms.ModelForm):
    class Meta:
        model = Client
        fields = [
            "statut", "contact_prenom", "contact_nom", "fonction", "telephone", "email", "origine",
            "siren", "denomination", "forme_juridique", "adresse_siege", "code_naf", "activite",
            "date_creation", "notes",
        ]
        widgets = {
            "date_creation": forms.DateInput(attrs={"type": "date"}, format="%Y-%m-%d"),
            "notes": forms.Textarea(attrs={"rows": 3}),
        }


class EchangeForm(forms.ModelForm):
    class Meta:
        model = Echange
        fields = ["date", "canal", "resume"]
        widgets = {
            "date": forms.DateTimeInput(attrs={"type": "datetime-local"}, format="%Y-%m-%dT%H:%M"),
            "resume": forms.Textarea(attrs={"rows": 3}),
        }
