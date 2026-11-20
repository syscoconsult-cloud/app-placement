# Stratégie : stockage local, automatisations et commercialisation

## 1. CRM en local + Make : est-ce possible ?

**Oui, en partie.** Il faut distinguer deux sens de circulation.

| Sens | Exemple | En local ? |
|---|---|---|
| **CRM → Make** (sortant) | « Le dossier passe en Signée » → Make envoie l'e-mail de bienvenue avec le lien Calendly | **Oui.** Votre ordinateur appelle Make, comme un navigateur ouvre un site. Rien à ouvrir sur votre ordinateur. |
| **Make → CRM** (entrant) | « Le client a signé dans Jesignexpert » → Make met à jour le CRM | **Non**, sauf à exposer votre ordinateur sur Internet (tunnel), ce que je déconseille. |

Le CRM est donc construit pour fonctionner **dès aujourd'hui en local** :

- tous les déclenchements partent du CRM (changement de statut → événement envoyé à Make) ;
- si Internet est coupé, les événements attendent dans une file et sont renvoyés ensuite ;
- les retours (signature faite, RDV pris) se font pour l'instant **en un clic** dans la fiche ;
- le point d'entrée `/api/entrant` existe déjà : il deviendra automatique le jour où le CRM
  sera sur un serveur.

**Make et le RGPD.** Make propose un hébergement dans l'UE et un accord de sous-traitance
(DPA) : il est utilisable, à condition de **minimiser** ce qui lui est envoyé. C'est ce que
fait le CRM : jamais de pièce d'identité, de statut PPE ni de score LCB-FT ; seulement le
nom de l'entité, le SIREN, le statut, le contact et le lien de RDV. Pour aller plus loin,
**n8n auto-hébergé** sur un serveur en France fait la même chose sans tiers.

**Les limites du local à connaître :**
- vos collaborateurs n'y accèdent pas depuis leur poste (sauf réseau local) ;
- c'est vous qui faites les sauvegardes ;
- l'ordinateur doit être allumé pour que les événements partent.

**Trajectoire recommandée :**

1. **Local** (maintenant) : vous validez le produit sur vos vrais dossiers.
2. **Serveur en France** (OVH / Scaleway, ~15 €/mois) : accès des collaborateurs,
   automatisations dans les deux sens, sauvegardes automatiques. Le code est déjà prêt :
   la base passe de SQLite à PostgreSQL en changeant une ligne.
3. **Version commercialisée** (voir § 3).

## 2. Ce qui a été repris des meilleurs CRM

| Inspiration | Fonction | Dans le CRM |
|---|---|---|
| **Airtable** | Vue grille : tri, filtres, colonnes masquables, édition dans la cellule, regroupement | ✅ Fait |
| **Notion** | Fiche « page » avec propriétés + notes libres | ✅ Fait (onglets) |
| **HubSpot** | Pipeline Kanban avec étapes à **conditions obligatoires** avant de passer à la suite | ✅ Fait (règle déontologique bloquante) |
| **HubSpot** | Historique d'activité par fiche | ✅ Fait (onglet Historique + journal d'audit) |
| **Pipedrive** | Relances en retard mises en évidence | ✅ Fait (date en rouge) |
| **HubSpot** | Lien de prise de RDV intégré au parcours | ✅ Fait via Calendly / Cal.com |
| **Airtable** | Vues enregistrées et partagées (« Mes relances », « LCB-FT à revoir ») | 🔜 Phase 2 |
| **HubSpot** | Formulaire web de capture de leads (site → CRM) | 🔜 Version serveur |
| **HubSpot** | Tâches et rappels, tableau de bord (taux de conversion, CA signé) | 🔜 Phases 5–6 |
| **Notion / Airtable** | Modèles de documents remplis automatiquement | 🔜 Phase 3 |

Ce que **aucun** de ces outils ne fait et qui fait votre différence : la conformité
déontologique et LCB-FT **intégrée au pipeline**, avec preuve horodatée.

## 3. Commercialisation (France et Bénin)

L'architecture est prévue pour : **chaque donnée appartient à un cabinet** (`cabinetId`).
Un seul serveur pourra héberger plusieurs cabinets clients sans que leurs données se croisent.
Le pays du cabinet (FR / BJ) est déjà enregistré pour adapter le référentiel.

**À adapter pour le Bénin** (points à valider avec un juriste local) :
- **Données personnelles** : loi n° 2017-20 portant Code du numérique et autorité APDP.
  Vérifier les règles sur l'hébergement hors du Bénin et les formalités préalables.
- **LCB-FT** : cadre UEMOA et loi béninoise relative à la LBC/FT, déclarations à la CENTIF.
  La grille de risque et les libellés deviennent paramétrables par pays.
- **Profession** : référentiel de l'Ordre des experts-comptables du Bénin (OECCA-Bénin).
- **Identifiants** : IFU et RCCM au lieu du SIREN (le champ accepte déjà les deux).
- **Comptabilité** : SYSCOHADA ; Pennylane n'y est pas utilisé, d'autres connecteurs seront nécessaires.
- **Paiement des abonnements** : Mobile Money via des solutions locales.

**Suite logicielle.** Le module de **suivi des échéances** pourra partager la même base :
mêmes cabinets, mêmes utilisateurs, mêmes clients. Un client devenu « Client actif » dans le
CRM générera automatiquement son calendrier d'échéances fiscales et sociales.

**Avant de vendre**, il faudra en plus :
- un hébergement certifié et un contrat de sous-traitance RGPD pour vos clients ;
- une procédure de sauvegarde, de reprise après incident et de support ;
- des tests de sécurité (audit externe recommandé) ;
- des conditions générales et une politique de confidentialité.
