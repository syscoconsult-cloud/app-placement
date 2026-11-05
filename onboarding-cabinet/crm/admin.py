from django.contrib import admin

from .models import Client, Echange, Reponse

admin.site.register(Client)
admin.site.register(Echange)
admin.site.register(Reponse)
