# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## 📋 Projet : Générateur Lettres de Mission (OEC/RGPD)

Application web pour cabinet expertise comptable & commissaires aux comptes. **But** : automatiser la génération de lettres de mission (LDM) depuis Notion CRM → validation docs → PDF signé électroniquement → archivage OneDrive/Pennylane.

**Profil legal** : profession réglementée (OEC) + données sensibles (clients, finances) = conformité **OEC + RGPD stricte**.

---

## 🏗️ Architecture

### Flux Workflow Complet
```
1. Prospect → Calendly + visio
2. Cabinet note infos dans Notion CRM
3. APP étape 1 : Saisie prospect (formulaire lié Notion)
4. APP étape 2 : Upload docs (pièce identité + KBIS + statuts)
   └─ Lit depuis OneDrive (cabinet)
   └─ Valide côté app
   └─ NE CONSERVE PAS en local (uniquement OneDrive)
5. Génération PDF LDM (template OEC + substitution variables)
6. Prévisualisation LDM avant signature
7. Envoi à JeSigneExpert (signature électronique)
8. Archivage OneDrive + création dossier Pennylane
```

### Stack Technique
- **Frontend** : HTML/CSS/JS vanilla (no framework)
  - Pages : Dashboard, New Mission, Preview LDM, Tracking
  - Validation docs client-side
  - Zéro tracking/analytics
- **Backend** : Netlify Functions (serverless Node.js)
  - Génération PDF (jspdf/pdfkit)
  - OAuth intégrations (Notion, OneDrive, JeSigneExpert)
  - Audit logging (OneDrive)
- **Stockage** :
  - **Notion** : source unique infos prospect (CRM)
  - **OneDrive** : docs client + LDM générées + audit logs
  - **JeSigneExpert** : signature électronique + webhooks
- **Déploiement** : Netlify (HTML statique + Functions)

### Modèle Données Minimal
```
Dossier Mission {
  id: uuid
  statut: "en_cours" | "signature_en_cours" | "signée" | "archivée"
  prospect: { nom, email, notion_id }
  mission: { type, organisation, tarif, spécificités, date_début }
  documents: {
    kbis: { url_onedrive, hash_sha256, scan_date },
    statuts: { url_onedrive, hash_sha256, scan_date } // optionnel
  }
  ldm: {
    pdf_url: "onedrive",
    generated_at: iso8601,
    variables: { all substituted values }
  }
  signature: {
    jesigneexpert_id: string,
    statut: "en_attente" | "signée",
    ldm_final_url: "onedrive"
  }
  audit: [
    { timestamp, action, user, details }
  ]
}
```

---

## 📁 Structure Fichiers

```
app-placement/
├── CLAUDE.md                    # Cet aperçu
├── config.example.js           # Template config (tokens API)
├── netlify.toml               # Build + env vars
│
├── src/
│   ├── index.html             # Dashboard principal
│   ├── new-mission.html       # Formulaires étapes 1-2
│   ├── preview-ldm.html       # Prévisualisation + validation
│   ├── tracking.html          # Suivi signature + archivage
│   │
│   ├── js/
│   │   ├── config.js          # Config (chargé par HTML)
│   │   ├── api-notion.js      # Intégration Notion API
│   │   ├── api-onedrive.js    # Intégration OneDrive API
│   │   ├── api-jesigneexpert.js # Intégration JeSigneExpert
│   │   ├── ldm-generator.js   # Génération PDF + substitution
│   │   ├── validation.js      # Validation docs + format
│   │   ├── audit.js           # Logging audit (appels Functions)
│   │   ├── storage.js         # Cache local (IndexedDB) minimal
│   │   └── main.js            # Orchestration pages
│   │
│   ├── css/
│   │   ├── base.css           # Reset + layout
│   │   ├── form.css           # Formulaires
│   │   ├── components.css     # Boutons, modales, etc.
│   │   └── responsive.css     # Mobile-first
│   │
│   └── assets/
│       ├── ldm-template-oec.pdf # Template LDM officiel Ordre
│       ├── logo.svg
│       └── favicon.svg
│
├── functions/                  # Netlify Functions (backend)
│   ├── auth-notion.js         # OAuth Notion + token exchange
│   ├── auth-onedrive.js       # OAuth OneDrive + token exchange
│   ├── auth-jesigneexpert.js  # OAuth JeSigneExpert + token exchange
│   ├── generate-ldm.js        # Génération PDF côté serveur
│   ├── webhook-jesigneexpert.js # Webhook signature (statut update)
│   ├── audit-log.js           # POST audit events (OneDrive)
│   └── utils/
│       ├── oec-templates.js   # Templates LDM par type mission
│       └── encryption.js      # ChaCha20-Poly1305 si données sensibles
│
└── docs/
    ├── API.md                 # Endpoints Functions
    ├── RGPD.md               # Politique confidentialité
    ├── OEC.md                # Conformité Ordre
    └── INTEGRATION.md        # Setup intégrations tierces
```

---

## 🔐 Conformité OEC + RGPD

### Obligations OEC
- ✅ Template LDM officiel Ordre (src/assets/ldm-template-oec.pdf)
- ✅ Signature électronique valide (JeSigneExpert = eIDAS compliant)
- ✅ Archivage minimum 7 ans (OneDrive cabinet)
- ✅ Audit trail complet (logs OneDrive)
- ✅ Confidentialité client (Access Control)

### Obligations RGPD
- ✅ **Minimisation données** : pièce identité lue OneDrive, jamais conservée app
- ✅ **Consentement** : banneau avant upload + CGU confidentialité
- ✅ **Chiffrement** : TLS 1.3 transit + E2E OneDrive au repos
- ✅ **Audit trail** : logs OneDrive (quoi, qui, quand)
- ✅ **Droit d'oubli** : suppression docs après 7 ans + anonymisation
- ✅ **Pas de tracking** : zéro Google Analytics / cookies

---

## 🚀 Setup + Commandes

### Installation locale
```bash
git clone https://github.com/syscoconsult-cloud/app-placement.git
cd app-placement
cp config.example.js src/js/config.js

# Remplir config.js avec :
# - NOTION_TOKEN (API key)
# - ONEDRIVE_CLIENT_ID + ONEDRIVE_CLIENT_SECRET
# - JESIGNEEXPERT_API_KEY + JESIGNEEXPERT_WEBHOOK_SECRET
```

### Développement local
```bash
# Sans backend : app tourne en mode démo (infos ficti)
open src/index.html

# Avec Netlify local (si dev functions)
netlify dev
# Accès : http://localhost:8888
```

### Déploiement Netlify
```bash
git push origin claude/mission-letter-app-sgcti3
# Netlify auto-déploie (webhook GitHub)

# Ou manuel :
netlify deploy --prod
```

### Tests
```bash
# Validation docs (client-side)
node src/js/validation.js

# Génération PDF (server-side)
node functions/generate-ldm.js --test
```

---

## 🔗 Intégrations Tierces

### Notion
- **Endpoint** : `GET /functions/auth-notion`
- **Token** : Personnel Access Token (database read/write scope)
- **Usage** : lire prospect infos + tarifs

### OneDrive
- **OAuth flow** : `GET /functions/auth-onedrive` → redirect → callback
- **Permissions** : sites.read.all, files.readwrite.all (cabinet folder)
- **Usage** : lire pièce identité (validation) + stocker KBIS/LDM/logs

### JeSigneExpert
- **API** : REST + webhooks
- **Webhook** : POST `/functions/webhook-jesigneexpert` (signature events)
- **Usage** : envoi LDM pour signature + statut suivi

### Pennylane
- **Status** : pas d'API directe (créer dossier = manuel)
- **TODO** : tester intégration LDM Pennylane post-signature

---

## ⚙️ Développement

### Ajouter une page
1. Créer `src/[new-page].html` (copier structure `src/index.html`)
2. Importer JS dans `<script src="js/main.js"></script>`
3. Ajouter nav dans `src/js/main.js` (routeur)

### Ajouter intégration API
1. Créer `src/js/api-[service].js` (OAuth + requests)
2. Créer `functions/auth-[service].js` (backend OAuth exchange)
3. Remplir `config.js` avec clés

### Ajouter function Netlify
1. Créer `functions/[name].js` (exports.handler)
2. Variables env dans `netlify.toml` → environment
3. Appeler depuis JS : `fetch('/.netlify/functions/[name]')`

---

## 🎯 Phases Implémentation

### Phase 1 : MVP (semaine 1-2)
- [x] Structure HTML pages
- [ ] Intégration Notion (lire prospect)
- [ ] Formulaire saisie + upload docs
- [ ] Génération PDF LDM basique
- [ ] Intégration JeSigneExpert (upload + signature)

### Phase 2 : Conformité (semaine 3)
- [ ] Audit trail (OneDrive logs)
- [ ] Chiffrement données sensibles
- [ ] Banneau RGPD + consentement
- [ ] Validation docs format/contenu

### Phase 3 : Pennylane + Polish (semaine 4)
- [ ] Webhook Pennylane (création dossier)
- [ ] Test LDM Pennylane
- [ ] UI/UX refinement
- [ ] Docs + déploiement

---

## ⚠️ Points Critiques

| Risque | Mitigation |
|--------|-----------|
| Pièce identité en DB | Lire OneDrive, jamais stocker app |
| Token API leaks | .env (jamais commité), rotation tokens |
| Signature rejetée JeSigneExpert | Test webhook, logs détaillés |
| Archivage manqué OneDrive | Vérifier post-signature avant suppression jeSigne |
| RGPD violation (tracking) | Audit : zéro cookies, zéro analytics |

---

## 📚 Références

- **OEC** : https://www.ordre-experts-comptables.fr
- **Lettres de mission** : https://www.oec.fr/ressources/modeles-contrats
- **RGPD CNIL** : https://www.cnil.fr
- **JeSigneExpert** : https://www.jesigneexpert.com/api
- **OneDrive API** : https://docs.microsoft.com/en-us/onedrive/developer
- **Notion API** : https://developers.notion.com

---

## 💬 Questions Fréquentes

**Q: Où sont stockées les données sensibles ?**
A: Uniquement OneDrive cabinet (pièce identité lue mais pas conservée app). LDM archivées OneDrive.

**Q: Comment respecter RGPD avec signatures électroniques ?**
A: JeSigneExpert est Data Processor = contrat de traitement signé. Cabinet = Data Controller.

**Q: Que faire si JeSigneExpert refuse la signature ?**
A: Logs détaillés + client peut re-charger LDM + retenter.

**Q: Quand supprimer documents ?**
A: Après 7 ans légaux (archivage OEC), puis anonymisation / suppression sécurisée.
