// Listes de valeurs du CRM. Modifier ici pour changer les libellés partout dans l'application.

export const STATUTS = [
  { id: "lead", libelle: "Lead qualifié", couleur: "bg-slate-100 text-slate-700" },
  { id: "acceptation", libelle: "Acceptation", couleur: "bg-blue-100 text-blue-700" },
  { id: "lcbft", libelle: "LCB-FT", couleur: "bg-violet-100 text-violet-700" },
  { id: "lm_envoyee", libelle: "Lettre de mission envoyée", couleur: "bg-amber-100 text-amber-800" },
  { id: "signee", libelle: "Signée", couleur: "bg-emerald-100 text-emerald-700" },
  { id: "onboarding", libelle: "Onboarding planifié", couleur: "bg-teal-100 text-teal-700" },
  { id: "client_actif", libelle: "Client actif", couleur: "bg-green-600 text-white" },
  { id: "refuse", libelle: "Refusé", couleur: "bg-red-100 text-red-700" },
] as const;

export type StatutId = (typeof STATUTS)[number]["id"];

export const libelleStatut = (id: string) => STATUTS.find((s) => s.id === id)?.libelle ?? id;
export const couleurStatut = (id: string) => STATUTS.find((s) => s.id === id)?.couleur ?? "";

export const TYPES_MISSION = [
  { id: "tenue", libelle: "Tenue / présentation des comptes" },
  { id: "revision", libelle: "Révision / examen limité" },
  { id: "social", libelle: "Social / paie" },
  { id: "juridique", libelle: "Juridique annuel" },
  { id: "conseil", libelle: "Conseil" },
  { id: "creation", libelle: "Création d'entreprise" },
];
export const libelleMission = (id?: string | null) =>
  TYPES_MISSION.find((t) => t.id === id)?.libelle ?? (id || "—");

export const ROLES_PERSONNE = [
  { id: "dirigeant", libelle: "Dirigeant" },
  { id: "beneficiaire_effectif", libelle: "Bénéficiaire effectif" },
  { id: "contact", libelle: "Contact" },
];
export const libelleRolePersonne = (id: string) =>
  ROLES_PERSONNE.find((r) => r.id === id)?.libelle ?? id;

export const SOURCES = ["Recommandation", "Site internet", "Réseaux sociaux", "Réseau / événement", "Confrère", "Autre"];
