import { db } from "@/lib/db";
import { exigerUtilisateur } from "@/lib/session";
import { VueDossiers, type LigneDossier } from "@/components/VueDossiers";

export const dynamic = "force-dynamic";

export default async function Dossiers() {
  const s = await exigerUtilisateur();
  const dossiers = await db.dossier.findMany({
    where: { cabinetId: s.cid },
    include: { entite: { include: { personnes: true } }, acceptation: true, lcbft: true, responsable: true },
    orderBy: { updatedAt: "desc" },
  });
  const lignes: LigneDossier[] = dossiers.map((d) => {
    const contact = d.entite.personnes.find((p) => p.role === "contact") ?? d.entite.personnes[0];
    return {
      id: d.id,
      raisonSociale: d.entite.raisonSociale,
      siren: d.entite.siren,
      contact: contact ? `${contact.prenom} ${contact.nom}`.trim() : null,
      email: contact?.email ?? null,
      statut: d.statut,
      type: d.type,
      typeMission: d.typeMission,
      source: d.source,
      honorairesEstimes: d.honorairesEstimes,
      responsable: d.responsable?.nom ?? null,
      prochaineRelance: d.prochaineRelance ? d.prochaineRelance.toISOString().slice(0, 10) : null,
      niveauLcbft: d.lcbft?.niveau ?? null,
      acceptationOk: d.acceptation?.decision === "acceptee" && !!d.acceptation.valideLe,
      lcbftOk: !!d.lcbft?.valideLe,
      majLe: d.updatedAt.toISOString(),
    };
  });
  return (
    <>
      <h1 className="mb-4 text-xl font-semibold">Dossiers</h1>
      <VueDossiers lignes={lignes} />
    </>
  );
}
