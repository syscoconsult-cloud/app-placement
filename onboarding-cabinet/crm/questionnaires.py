"""
Les questionnaires sont décrits dans des fichiers JSON (dossier questionnaires/),
pour pouvoir changer les questions sans toucher au code.

Types de questions possibles :
  texte, texte_long, nombre, date, oui_non, choix, choix_multiple
"""

import json
from functools import lru_cache

from django import forms
from django.conf import settings
from django.http import Http404

QUESTIONNAIRES = {
    "prise_de_connaissance": "Prise de connaissance",
    # À venir : "lab_ft", "acceptation_mission"
}


@lru_cache(maxsize=None)
def charger(nom: str) -> dict:
    if nom not in QUESTIONNAIRES:
        raise Http404("Questionnaire inconnu")
    chemin = settings.DOSSIER_QUESTIONNAIRES / f"{nom}.json"
    return json.loads(chemin.read_text(encoding="utf-8"))


def _champ(q: dict) -> forms.Field:
    commun = {"label": q["libelle"], "required": False, "help_text": q.get("aide", "")}
    t = q["type"]
    if t == "texte":
        return forms.CharField(**commun)
    if t == "texte_long":
        return forms.CharField(widget=forms.Textarea(attrs={"rows": 3}), **commun)
    if t == "nombre":
        return forms.DecimalField(**commun)
    if t == "date":
        return forms.DateField(widget=forms.DateInput(attrs={"type": "date"}), **commun)
    if t == "oui_non":
        return forms.ChoiceField(choices=[("", "—"), ("oui", "Oui"), ("non", "Non")],
                                 widget=forms.RadioSelect, **commun)
    if t == "choix":
        return forms.ChoiceField(choices=[("", "—")] + [(o, o) for o in q["options"]], **commun)
    if t == "choix_multiple":
        return forms.MultipleChoiceField(choices=[(o, o) for o in q["options"]],
                                         widget=forms.CheckboxSelectMultiple, **commun)
    raise ValueError(f"Type de question inconnu : {t}")


def construire_formulaire(definition: dict, data=None, initial=None) -> forms.Form:
    form = forms.Form(data=data, initial=initial)
    for section in definition["sections"]:
        for q in section["questions"]:
            form.fields[q["id"]] = _champ(q)
    return form


def sections_du_formulaire(definition: dict, form: forms.Form):
    """Regroupe les champs du formulaire par section, pour l'affichage."""
    return [
        {"titre": s["titre"], "champs": [form[q["id"]] for q in s["questions"]]}
        for s in definition["sections"]
    ]


def serialiser(cleaned: dict) -> dict:
    """Convertit les réponses en valeurs JSON (dates et nombres en texte)."""
    resultat = {}
    for cle, valeur in cleaned.items():
        if valeur in (None, "", []):
            continue
        if hasattr(valeur, "isoformat"):
            valeur = valeur.isoformat()
        elif not isinstance(valeur, (str, list)):
            valeur = str(valeur)
        resultat[cle] = valeur
    return resultat
