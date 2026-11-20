// Grille d'évaluation du risque LCB-FT (approche par les risques).
// Les pondérations et seuils sont des valeurs de départ : adaptez-les à votre procédure
// interne de cabinet. La décision finale reste celle de l'expert-comptable.

export type Critere = { id: string; libelle: string; points: number; imposeRenforce?: boolean };

export const CRITERES_LCBFT: Critere[] = [
  { id: "ppe", libelle: "Dirigeant ou bénéficiaire effectif PPE (ou proche)", points: 4, imposeRenforce: true },
  { id: "pays_risque", libelle: "Lien avec un pays à haut risque (liste GAFI / UE)", points: 4, imposeRenforce: true },
  { id: "be_non_identifie", libelle: "Bénéficiaire effectif difficile à identifier", points: 4 },
  { id: "secteur_sensible", libelle: "Secteur sensible (BTP, immobilier, restauration, crypto, négoce…)", points: 3 },
  { id: "especes", libelle: "Activité générant beaucoup d'espèces", points: 3 },
  { id: "montage_complexe", libelle: "Montage juridique complexe sans justification économique", points: 3 },
  { id: "incoherence", libelle: "Incohérence entre activité, moyens et flux annoncés", points: 3 },
  { id: "distance", libelle: "Relation à distance (client jamais rencontré)", points: 2 },
  { id: "entite_recente", libelle: "Entité créée depuis moins d'un an", points: 1 },
  { id: "changement_conseil", libelle: "Changements fréquents d'expert-comptable", points: 2 },
];

export type Niveau = "faible" | "standard" | "renforce";

export const LIBELLES_NIVEAU: Record<Niveau, string> = {
  faible: "Vigilance allégée",
  standard: "Vigilance standard",
  renforce: "Vigilance renforcée",
};

// Délai de revue du dossier selon le niveau (en mois) — à adapter
export const REVUE_MOIS: Record<Niveau, number> = { faible: 36, standard: 24, renforce: 12 };

export function calculerRisque(criteres: Record<string, boolean>): { score: number; niveau: Niveau } {
  let score = 0;
  let renforceImpose = false;
  for (const c of CRITERES_LCBFT) {
    if (criteres[c.id]) {
      score += c.points;
      if (c.imposeRenforce) renforceImpose = true;
    }
  }
  let niveau: Niveau = score <= 2 ? "faible" : score <= 7 ? "standard" : "renforce";
  if (renforceImpose) niveau = "renforce";
  return { score, niveau };
}

export function dateProchaineRevue(niveau: Niveau, depuis = new Date()): Date {
  const d = new Date(depuis);
  d.setMonth(d.getMonth() + REVUE_MOIS[niveau]);
  return d;
}
