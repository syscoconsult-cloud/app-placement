// ──────────────────────────────────────────────────────────────
//  CarbuDispo — Configuration Supabase
//
//  Tant que ces valeurs ne sont pas remplies, l'application tourne
//  en MODE DÉMO (stations fictives, données gardées sur le téléphone).
//
//  Où trouver ces valeurs : Supabase → votre projet → Project Settings
//  → API → « Project URL » et la clé « anon public ».
//
//  La clé « anon public » est faite pour être visible dans le
//  navigateur : la sécurité repose sur les règles d'accès (RLS)
//  créées par supabase/schema.sql. Ne mettez JAMAIS ici la clé
//  « service_role ».
// ──────────────────────────────────────────────────────────────
window.CARBU_CONFIG = {
  SUPABASE_URL: 'COLLER_ICI_VOTRE_PROJECT_URL',      // ex : https://abcdefgh.supabase.co
  SUPABASE_ANON_KEY: 'COLLER_ICI_VOTRE_CLE_ANON',

  // true pendant les tests : la règle « à moins de 300 m de la station »
  // ne bloque pas les signalements. Passer à false au lancement public.
  TEST_MODE: true
};
