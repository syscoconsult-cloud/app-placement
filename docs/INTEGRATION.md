# 🔗 Guide d'Intégration — Lettres de Mission

Guide step-by-step pour configurer les intégrations tierces (Notion, OneDrive, JeSigneExpert, Pennylane).

---

## 1️⃣ **Notion — Source CRM**

### Étape 1 : Créer une Base de Données Notion

1. Ouvrir [notion.com](https://notion.com)
2. Créer une nouvelle page (ex: "Prospects")
3. Ajouter une **Database** avec les colonnes suivantes :

| Colonne | Type | Description |
|---------|------|-------------|
| **Nom** | Title | Nom du prospect/entreprise |
| **Email** | Email | Email contact |
| **Telephone** | Text | Téléphone |
| **Type de Mission** | Select | Expertise Comptable / CAC / Audit / Conseil |
| **Organisation** | Select | SARL / SAS / EURL / EIRL / SCI / GAEC |
| **Tarif** | Number | Honoraires annuels (€) |
| **Spécificités** | Text | Notes mission |
| **Date de Début** | Date | Début mission |
| **Adresse** | Text | Adresse siège |
| **Statut** | Status | En cours / Signature en cours / Signée / Archivée |

### Étape 2 : Créer Personal Access Token

1. Aller sur [notion.com/my-integrations](https://notion.com/my-integrations)
2. Cliquer "+ New integration"
3. Nommer: "Lettres de Mission App"
4. Sélectionner capacités :
   - ✅ Read
   - ✅ Write
   - ✅ Update
5. Copier le **token secret** (commence par `ntn_...`)

### Étape 3 : Donner accès à la Base de Données

1. Ouvrir la base de données Notion
2. Cliquer "Share" (en haut à droite)
3. Chercher "Lettres de Mission App" et l'ajouter
4. Copier l'ID de la base (dans l'URL : `https://notion.so/xxxxxxxxxxxxxxxx?v=...`)

### Étape 4 : Configurer l'app

**src/js/config.js** :
```javascript
window.APP_CONFIG.notion = {
  token: "ntn_ABC123...", // ← Token du step 2
  databaseId: "xxxxx...", // ← ID du step 3
};
```

### Test

```bash
open src/new-mission.html
# Cliquer sur "Prospect (depuis Notion)"
# → Devrait afficher la liste de vos prospects Notion
```

---

## 2️⃣ **OneDrive — Stockage Sécurisé**

### Étape 1 : Enregistrer Application Azure AD

1. Aller sur [portal.azure.com](https://portal.azure.com)
2. **Enregistrement d'applications** → Nouvelle inscription
3. Configurer :
   - **Nom** : "Lettres de Mission App"
   - **Types de comptes supportés** : "Comptes personnels uniquement" (ou Org + perso)
   - **URI de redirection** : `http://localhost:8888/src/callback-onedrive.html` (local) + `https://votre-domain.netlify.app/src/callback-onedrive.html` (prod)

### Étape 2 : Créer Credentials

1. Aller dans l'app → **Certificats et secrets**
2. **Nouveau secret client**
3. Copier la **valeur** (⚠️ apparaît une seule fois)

### Étape 3 : Configurer permissions API

1. **Autorisations API** → Ajouter une autorisation
2. Chercher "Microsoft Graph"
3. Permissions déléguées :
   - ✅ `Files.ReadWrite.All` (lire/écrire fichiers)
   - ✅ `Sites.Read.All` (lire sites SharePoint)
4. Demander **consentement de l'administrateur** (si org)

### Étape 4 : Récupérer IDs

1. **Vue d'ensemble** de l'app Azure AD
2. Copier :
   - **ID d'application (client)** → `clientId`
   - **Secret** (step 2) → `clientSecret`
   - **ID de répertoire (locataire)** → `tenantId`

### Étape 5 : Trouver ID dossier cabinet OneDrive

```bash
# Via PowerShell / CLI

# Option 1: Via Microsoft Graph Explorer
# https://developer.microsoft.com/en-us/graph/graph-explorer
GET /me/drive/root/children
# → Copier l'ID du dossier "Cabinet" ou créer un nouveau

# Option 2: Via OneDrive Web
# Clic droit sur dossier → "Copier le lien" → ID est dans l'URL
```

### Étape 6 : Configurer l'app

**src/js/config.js** :
```javascript
window.APP_CONFIG.onedrive = {
  clientId: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  clientSecret: "SECRET_VALUE_FROM_STEP_2",
  tenantId: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  cabinetFolderId: "ID_DU_DOSSIER_CABINET",
  redirectUri: `${window.location.origin}/src/callback-onedrive.html`,
};
```

**netlify.toml** (env vars Netlify UI) :
```
ONEDRIVE_CLIENT_ID=...
ONEDRIVE_CLIENT_SECRET=...
ONEDRIVE_TENANT_ID=...
ONEDRIVE_CABINET_FOLDER_ID=...
```

### Créer callback page

**src/callback-onedrive.html** :
```html
<!DOCTYPE html>
<html>
<head>
  <title>OneDrive Callback</title>
  <script src="js/config.js"></script>
  <script src="js/api-onedrive.js"></script>
</head>
<body>
  <p>Traitement authentification OneDrive...</p>
  <script>
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');

    if (code) {
      const onedrive = new OneDriveAPI(window.APP_CONFIG.onedrive);
      onedrive.exchangeCodeForToken(code).then(success => {
        if (success) {
          sessionStorage.setItem('onedrive_authenticated', 'true');
          window.location.href = 'new-mission.html';
        } else {
          alert('❌ Authentification OneDrive échouée');
          window.location.href = 'index.html';
        }
      });
    } else {
      alert('❌ Code authorization manquant');
      window.location.href = 'index.html';
    }
  </script>
</body>
</html>
```

### Test

```bash
netlify dev
# Cliquer "Créer nouvelle mission" → Upload fichiers
# → Devrait uploader sur OneDrive
```

---

## 3️⃣ **JeSigneExpert — Signature Électronique**

### Étape 1 : Créer compte JeSigneExpert

1. Aller sur [jesigneexpert.com](https://www.jesigneexpert.com)
2. Créer compte business
3. Vérifier email

### Étape 2 : Activer API

1. Tableau de bord → **Paramètres → API**
2. Générer **clé API**
3. Copier la clé

### Étape 3 : Configurer Webhook

1. **Paramètres → Webhooks**
2. Ajouter webhook :
   - **URL** : `https://votre-app.netlify.app/.netlify/functions/webhook-jesigneexpert`
   - **Événements** : `signature.signed`, `signature.rejected`
   - **Secret** : générer et copier

### Étape 4 : Configurer l'app

**src/js/config.js** :
```javascript
window.APP_CONFIG.jesigneexpert = {
  apiKey: "jse_...",
  webhookSecret: "secret_webhook_...",
  webhookUrl: "https://votre-app.netlify.app/.netlify/functions/webhook-jesigneexpert",
};
```

**netlify.toml** :
```
JESIGNEEXPERT_API_KEY=...
JESIGNEEXPERT_WEBHOOK_SECRET=...
```

### Créer Webhook Handler

**functions/webhook-jesigneexpert.js** :
```javascript
exports.handler = async (event, context) => {
  try {
    const payload = JSON.parse(event.body);
    const signature = require('crypto');

    // Vérifier signature webhook
    const secret = process.env.JESIGNEEXPERT_WEBHOOK_SECRET;
    // TODO: Implémenter vérification HMAC

    console.log('JeSigneExpert webhook:', {
      event: payload.event,
      documentId: payload.document_id,
      status: payload.status,
    });

    // TODO: Mettre à jour statut mission dans Notion
    // TODO: Si signée: archiver sur OneDrive + Pennylane

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error('Webhook error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
```

### Test

```bash
# Envoyer une LDM à signature (preview-ldm.html → "Envoyer à signature")
# Client reçoit email JeSigneExpert → signe
# Webhook reçoit notification → statut change en "Signée"
```

---

## 4️⃣ **Pennylane — Comptabilité (Optionnel)**

### Status: API exploration

Pennylane n'expose pas (encore) d'API publique pour créer dossiers/importer LDM.

### Options:

1. **Manuel** : Créer dossier Pennylane après archivage OneDrive (simplement)
2. **Webhook** : Si Pennylane supporte webhooks (à vérifier)
3. **CSV Import** : Exporter données mission → import Pennylane

### À tester:

```bash
# Vérifier si Pennylane a une API
curl https://api.pennylane.io/docs

# Ou contacter support Pennylane pour accès API
```

---

## 🧪 **Checklist Configuration Complète**

- [ ] Notion: Token + Database ID
- [ ] OneDrive: ClientID + Secret + TenantID + Folder ID
- [ ] JeSigneExpert: API Key + Webhook Secret
- [ ] Netlify env vars: tous les tokens configurés
- [ ] callback-onedrive.html: créée
- [ ] webhook-jesigneexpert.js: implémentée
- [ ] config.js: remplie (demo: false)
- [ ] Test local: Notion prospects chargent
- [ ] Test local: OneDrive upload fonctionne
- [ ] Test local: Signature JeSigneExpert fonctionne

---

## 📝 **Exemple config.js Complet**

```javascript
window.APP_CONFIG = {
  notion: {
    token: "ntn_1234567890abcdefghijk",
    databaseId: "abcd1234567890",
  },
  onedrive: {
    clientId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    clientSecret: "abc123~def456-ghi789",
    tenantId: "12345678-1234-1234-1234-123456789012",
    redirectUri: "https://lettres-mission.netlify.app/src/callback-onedrive.html",
    cabinetFolderId: "01ABCDEFGHIJKLMNOPQR",
  },
  jesigneexpert: {
    apiKey: "jse_prod_1234567890abcdefgh",
    webhookSecret: "webhook_secret_1234567890",
    webhookUrl: "https://lettres-mission.netlify.app/.netlify/functions/webhook-jesigneexpert",
  },
  pennylane: {
    webhookSecret: "py_secret",
  },
  encryption: {
    enabled: false,
  },
  audit: {
    enabled: true,
    storageProvider: "onedrive",
    logsFolder: "Audit Logs",
    retentionDays: 2555,
  },
  demo: false, // ⚠️ Set to false for production!
  debug: true, // Pour logs détaillés pendant dev
};
```

---

## 🆘 **Troubleshooting**

### "Notion token invalid"
→ Vérifier token commence par `ntn_` et est actif (pas expiré)
→ Vérifier base de données a accès l'app

### "OneDrive 401 Unauthorized"
→ Secret client expiré? Régénérer dans Azure AD
→ Vérifier redirectUri exacte dans Azure AD

### "JeSigneExpert signature never arrives"
→ Webhook URL correcte? Tester avec curl
→ Email client dans spam?
→ Vérifier document n'a pas dépassé size limit

### "Audit logs ne sauvegardent pas"
→ OneDrive token valide?
→ Dossier "Audit Logs" existe sur OneDrive?
→ Permissions suffisantes (files.readwrite.all)?

---

## 📚 **Références Officielles**

- **Notion API** : https://developers.notion.com
- **Microsoft Graph** : https://docs.microsoft.com/graph
- **JeSigneExpert API** : https://app.jesigneexpert.com/docs
- **Pennylane** : Contacter support

---

**Status**: Configuration manual (3-4 heures)  
**Difficulty**: ⭐⭐⭐ Intermédiaire  
**Support**: [GitHub Issues](https://github.com/syscoconsult-cloud/app-placement/issues)
