/**
 * config.example.js — Template configuration (Lettres de Mission OEC)
 * Copier en src/js/config.js et remplir avec vos clés API
 * ⚠️ NEVER commit config.js (déjà .gitignore)
 */

window.APP_CONFIG = {
  // Notion API — Source unique infos prospect
  notion: {
    token: "ntn_...", // Personal Access Token from notion.com/my-integrations
    databaseId: "...", // ID DB Notion (prospects/missions)
  },

  // OneDrive / Microsoft Graph — Stockage docs + LDM + logs audit
  onedrive: {
    clientId: "...",
    clientSecret: "...",
    tenantId: "...",
    redirectUri: `${window.location.origin}/src/callback-onedrive.html`,
    cabinetFolderId: "...", // ID dossier principal cabinet OneDrive
  },

  // JeSigneExpert — Signature électronique
  jesigneexpert: {
    apiKey: "...",
    webhookSecret: "...",
    webhookUrl: `${window.location.origin}/.netlify/functions/webhook-jesigneexpert`,
  },

  // Pennylane (intégration future)
  pennylane: {
    webhookSecret: "...",
  },

  // Chiffrement (optionnel — données sensibles)
  encryption: {
    enabled: false,
    keyId: "...",
  },

  // RGPD & Audit
  audit: {
    enabled: true,
    storageProvider: "onedrive",
    logsFolder: "Audit Logs",
    retentionDays: 2555, // 7 ans légalement
  },

  // Mode démo (données fictives pour test UI sans API)
  demo: false,

  // Debug
  debug: false,
};
