import "server-only";
import { db } from "./db";
import type { Session } from "./jeton";

/** Enregistre une action dans le journal d'audit (non modifiable). */
export async function journaliser(
  s: Pick<Session, "uid" | "cid" | "nom"> | { uid: null; cid: string; nom: string },
  action: string,
  objetType: string,
  objetId: string | null,
  avant?: unknown,
  apres?: unknown,
) {
  await db.journalAudit.create({
    data: {
      cabinetId: s.cid,
      utilisateurId: s.uid,
      utilisateurNom: s.nom,
      action,
      objetType,
      objetId,
      avant: avant === undefined ? null : JSON.stringify(avant),
      apres: apres === undefined ? null : JSON.stringify(apres),
    },
  });
}
