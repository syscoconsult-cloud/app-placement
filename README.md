# 📋 Lettres de Mission — Générateur OEC/RGPD

Application web pour cabinet expertise comptable & commissaires aux comptes. Automatise la génération, signature électronique et archivage de lettres de mission avec conformité **OEC + RGPD**.

## 🎯 Workflow

```
1. Prospect (Notion) → 2. Saisie formulaire
   ↓
3. Upload docs (pièce ID + KBIS) → 4. Validation client-side
   ↓
5. Génération PDF LDM (OEC template) → 6. Prévisualisation
   ↓
7. Envoi JeSigneExpert → 8. Signature électronique
   ↓
9. Archivage OneDrive + Pennylane
```

## 🔐 Conformité

- **OEC** : Template officiel + archivage 7 ans
- **RGPD** : Minimisation données + audit trail + chiffrement TLS
- **Pièce identité** : Lue OneDrive, jamais stockée app (confidentialité max)

## 🚀 Setup Local

### 1. Cloner & installer

```bash
git clone https://github.com/syscoconsult-cloud/app-placement.git
cd app-placement
cp config.example.js src/js/config.js
```

### 2. Remplir config.js

```javascript
window.APP_CONFIG = {
  notion: {
    token: "ntn_...", // https://notion.com/my-integrations
    databaseId: "...",
  },
  onedrive: {
    clientId: "...",
    clientSecret: "...",
    tenantId: "...",
    cabinetFolderId: "...",
  },
  jesigneexpert: {
    apiKey: "...",
    webhookSecret: "...",
  },
  demo: false, // true = données fictives pour test UI
};
```

### 3. Lancer localement

**Sans backend** (demo mode) :
```bash
open src/index.html
```

**Avec Netlify Functions** :
```bash
npm install -g netlify-cli
netlify dev
# http://localhost:8888
```

## 📁 Structure

```
src/
  ├── index.html                 # Dashboard missions
  ├── new-mission.html          # Formulaires étape 1-2
  ├── preview-ldm.html          # Prévisualisation LDM
  ├── tracking.html             # Suivi signature
  ├── js/
  │   ├── config.js             # Config API keys
  │   ├── api-notion.js         # Notion API
  │   ├── validation.js         # Validation docs
  │   └── audit.js              # Audit logging
  └── css/                       # Styles (à ajouter)

functions/
  ├── generate-ldm.js           # Génération PDF
  ├── send-to-signature.js      # Envoi JeSigneExpert
  ├── signature-status.js       # Vérifier statut
  ├── archive-mission.js        # Archivage
  ├── audit-log.js              # Logs OneDrive
  └── download-signed-ldm.js    # Télécharger LDM signée
```

## 🔧 API Endpoints (Netlify Functions)

| Function | Méthode | Purpose |
|----------|---------|---------|
| `/generate-ldm` | POST | Générer PDF LDM (variables substituées) |
| `/send-to-signature` | POST | Envoyer à JeSigneExpert |
| `/signature-status` | GET | Récupérer statut signature (poll) |
| `/archive-mission` | POST | Archiver OneDrive + Pennylane |
| `/audit-log` | POST | Enregistrer logs audit |
| `/download-signed-ldm` | GET | Télécharger LDM signée |

## 🔗 Intégrations Tierces

### Notion
- Lire prospects + infos mission
- **Scope** : database read/write
- **Token** : Personal Access Token (https://notion.com/my-integrations)

### JeSigneExpert
- Signature électronique (eIDAS compliant)
- **API** : REST + webhooks
- **Webhook** : POST `/functions/webhook-jesigneexpert` (events signature)

### OneDrive
- Stockage docs + LDM + audit logs
- **OAuth2** : Microsoft Graph API
- **Permissions** : files.readwrite.all

### Pennylane
- Création dossier mission (futur, actuellement manuel)
- **Status** : API à développer

## 🧪 Test Mode

Avec `config.js` → `demo: true` :
- ✅ UI tourne sans API réelles
- ✅ Données fictives (3 missions démo)
- ✅ Génération PDF locale
- ✅ Parfait pour test UI avant API setup

## 📝 Development

### Ajouter une page

1. Créer `src/[new-page].html`
2. Importer JS dans `<script src="js/..."></script>`
3. Ajouter nav dans `src/index.html`

### Ajouter une Function

1. Créer `functions/[name].js` (exports.handler)
2. Variables env dans `netlify.toml`
3. Appeler : `fetch('/.netlify/functions/[name]')`

### Tests Functions locales

```bash
netlify dev
# Function logs via `netlify dev` output
```

## 🚀 Déploiement Netlify

1. Push vers branch `claude/mission-letter-app-sgcti3`
2. Netlify auto-deploy (webhook GitHub)
3. Configurer env vars dans Netlify UI (Settings → Build & Deploy → Environment)

Ou manuel :
```bash
netlify deploy --prod
```

## 🔒 Sécurité

### Données sensibles
- ❌ Jamais committer `config.js`
- ✅ Utiliser `.env` → Netlify UI environment variables
- ✅ Tokens limités en portée (single database, single folder)

### RGPD/OEC
- ✅ Pièce identité : lue OneDrive, pas conservée app
- ✅ Audit trail : OneDrive horodaté
- ✅ TLS 1.3 : en transit
- ✅ E2E chiffrement : OneDrive au repos
- ✅ Rétention : 7 ans, puis suppression

### CSP Headers
- Default-src `'self'` (localhost)
- Pas de tracking (Google Analytics, etc.)
- Pas de cookies

## 📚 Documentation Complète

- **CLAUDE.md** : Architecture + development guide
- **docs/API.md** : Détail endpoints
- **docs/RGPD.md** : Politique confidentialité
- **docs/OEC.md** : Conformité Ordre

## 🤝 Contributing

1. Feature branch : `git checkout -b feature/xyz`
2. Développer + tester
3. Commit messages clairs
4. PR vers `claude/mission-letter-app-sgcti3`

## ❓ FAQ

**Q: Où sont stockées les données ?**
A: OneDrive cabinet uniquement. Pièce identité lue mais pas conservée app.

**Q: Combien coûte JeSigneExpert ?**
A: Variable selon volume. Consulter https://www.jesigneexpert.com/tarifs

**Q: Peut-on utiliser un autre service de signature ?**
A: Oui. Remplacer intégration JeSigneExpert par DocuSign/Yousign/etc. (adapter functions/)

**Q: Quand supprimer les dossiers archivés ?**
A: Après 7 ans légalement. Automatiser via script + cron.

**Q: Peut-on signer multipartite ?**
A: Oui, modifier `send-to-signature.js` pour ajouter multiples signataires.

---

**Version** : 0.1.0 (MVP)  
**License** : Proprietary  
**Maintainer** : [Cabinet Name]
