from django.urls import path

from . import views

urlpatterns = [
    path("", views.liste, name="liste"),
    path("clients/nouveau/", views.nouveau, name="nouveau"),
    path("clients/<int:pk>/", views.fiche, name="fiche"),
    path("clients/<int:pk>/modifier/", views.modifier, name="modifier"),
    path("clients/<int:pk>/echanges/", views.ajouter_echange, name="ajouter_echange"),
    path("clients/<int:pk>/questionnaires/<str:nom>/", views.questionnaire, name="questionnaire"),
    path("api/sirene/<str:siren>/", views.api_sirene, name="api_sirene"),
]
