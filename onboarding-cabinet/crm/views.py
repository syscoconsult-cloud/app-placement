from django.contrib import messages
from django.db.models import Q
from django.http import JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.utils import timezone

from . import questionnaires as qn
from . import sirene
from .forms import ClientForm, EchangeForm
from .models import Client, Reponse


def liste(request):
    clients = Client.objects.all()
    recherche = request.GET.get("q", "").strip()
    statut = request.GET.get("statut", "")
    if recherche:
        clients = clients.filter(
            Q(denomination__icontains=recherche) | Q(contact_nom__icontains=recherche)
            | Q(contact_prenom__icontains=recherche) | Q(siren__icontains=recherche)
            | Q(email__icontains=recherche)
        )
    if statut:
        clients = clients.filter(statut=statut)
    return render(request, "crm/liste.html", {
        "clients": clients, "recherche": recherche, "statut": statut, "statuts": Client.Statut.choices,
    })


def _enregistrer_client(request, client=None):
    form = ClientForm(request.POST or None, instance=client)
    if request.method == "POST" and form.is_valid():
        client = form.save(commit=False)
        donnees = request.session.pop("sirene_brut", None)
        if donnees and donnees.get("siren") == client.siren:
            client.donnees_sirene = donnees
        client.save()
        messages.success(request, "Fiche enregistrée.")
        return redirect("fiche", pk=client.pk)
    return render(request, "crm/client_form.html", {"form": form, "client": client})


def nouveau(request):
    return _enregistrer_client(request)


def modifier(request, pk):
    return _enregistrer_client(request, get_object_or_404(Client, pk=pk))


def fiche(request, pk):
    client = get_object_or_404(Client, pk=pk)
    echange_form = EchangeForm(initial={"date": timezone.localtime().strftime("%Y-%m-%dT%H:%M")})
    reponses = {r.questionnaire: r for r in client.reponses.all()}
    questionnaires = [
        {"nom": nom, "titre": titre, "reponse": reponses.get(nom)}
        for nom, titre in qn.QUESTIONNAIRES.items()
    ]
    dirigeants = []
    if client.donnees_sirene:
        dirigeants = sirene.extraire(client.donnees_sirene)["dirigeants"]
    return render(request, "crm/fiche.html", {
        "client": client, "echange_form": echange_form,
        "questionnaires": questionnaires, "dirigeants": dirigeants,
    })


def ajouter_echange(request, pk):
    client = get_object_or_404(Client, pk=pk)
    if request.method == "POST":
        form = EchangeForm(request.POST)
        if form.is_valid():
            echange = form.save(commit=False)
            echange.client = client
            echange.save()
            messages.success(request, "Échange ajouté.")
        else:
            messages.error(request, "Échange non enregistré : vérifiez la date et le résumé.")
    return redirect("fiche", pk=pk)


def questionnaire(request, pk, nom):
    client = get_object_or_404(Client, pk=pk)
    definition = qn.charger(nom)
    reponse = Reponse.objects.filter(client=client, questionnaire=nom).first()
    form = qn.construire_formulaire(
        definition, data=request.POST or None, initial=reponse.donnees if reponse else None
    )
    if request.method == "POST" and form.is_valid():
        reponse = reponse or Reponse(client=client, questionnaire=nom)
        reponse.donnees = qn.serialiser(form.cleaned_data)
        reponse.version = definition.get("version", "")
        reponse.termine = "terminer" in request.POST
        reponse.save()
        messages.success(request, f"{definition['titre']} enregistrée.")
        return redirect("fiche", pk=pk)
    return render(request, "crm/questionnaire.html", {
        "client": client, "definition": definition, "form": form,
        "sections": qn.sections_du_formulaire(definition, form), "reponse": reponse,
    })


def api_sirene(request, siren):
    try:
        infos = sirene.rechercher(siren)
    except sirene.ErreurSirene as e:
        return JsonResponse({"erreur": str(e)}, status=400)
    # Conservé en session pour être rattaché à la fiche à l'enregistrement.
    request.session["sirene_brut"] = infos.pop("brut")
    return JsonResponse(infos)
