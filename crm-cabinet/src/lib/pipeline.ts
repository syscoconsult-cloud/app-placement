// Règles de passage d'une étape à l'autre du pipeline.
// Fonction pure (sans base de données) pour pouvoir être testée facilement.

import { STATUTS, type StatutId } from "./constantes";

export type EtatDossier = {
  statut: string;
  acceptationValidee: boolean; // décision "acceptee" + validée par un admin
  lcbftValide: boolean; // dossier LCB-FT validé par un admin
};

const ORDRE: StatutId[] = STATUTS.map((s) => s.id).filter((s) => s !== "refuse") as StatutId[];

export function verifierTransition(
  dossier: EtatDossier,
  nouveau: string,
  motifRefus?: string | null,
): { ok: true } | { ok: false; raison: string } {
  if (!STATUTS.some((s) => s.id === nouveau)) return { ok: false, raison: "Statut inconnu." };
  if (nouveau === dossier.statut) return { ok: true };

  if (nouveau === "refuse") {
    if (!motifRefus || !motifRefus.trim())
      return { ok: false, raison: "Indiquez le motif du refus." };
    return { ok: true };
  }

  const cible = ORDRE.indexOf(nouveau as StatutId);
  const seuilLm = ORDRE.indexOf("lm_envoyee");

  // Règle déontologique bloquante : pas de lettre de mission sans acceptation et LCB-FT validées
  if (cible >= seuilLm) {
    if (!dossier.acceptationValidee)
      return { ok: false, raison: "L'acceptation de la mission doit d'abord être validée (onglet Acceptation)." };
    if (!dossier.lcbftValide)
      return { ok: false, raison: "Le dossier LCB-FT doit d'abord être validé (onglet LCB-FT)." };
  }
  return { ok: true };
}
