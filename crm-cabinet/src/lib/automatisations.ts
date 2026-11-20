import "server-only";
import { createHmac } from "node:crypto";
import { db } from "./db";
import { libelleStatut } from "./constantes";

// Principe : le CRM (même installé sur votre ordinateur) ENVOIE des événements vers Make / n8n.
// Un envoi sortant fonctionne depuis n'importe quel ordinateur connecté à Internet :
// pas besoin que le CRM soit accessible depuis l'extérieur.
// Seules les données strictement nécessaires à l'automatisation sont envoyées
// (minimisation RGPD) : jamais de pièce d'identité, de statut PPE ni de score LCB-FT.

export async function evenementChangementStatut(dossierId: string, ancien: string, nouveau: string) {
  const d = await db.dossier.findUnique({
    where: { id: dossierId },
    include: { entite: { include: { personnes: true } }, cabinet: true },
  });
  if (!d) return;
  const contact =
    d.entite.personnes.find((p) => p.role === "contact" && p.email) ??
    d.entite.personnes.find((p) => p.email) ??
    null;

  const payload = {
    evenement: "dossier.statut_modifie",
    date: new Date().toISOString(),
    dossier: {
      id: d.id,
      ancienStatut: ancien,
      nouveauStatut: nouveau,
      nouveauStatutLibelle: libelleStatut(nouveau),
      typeMission: d.typeMission,
      honorairesEstimes: d.honorairesEstimes,
    },
    entite: { raisonSociale: d.entite.raisonSociale, siren: d.entite.siren },
    contact: contact ? { prenom: contact.prenom, nom: contact.nom, email: contact.email } : null,
    // Lien de prise de rendez-vous d'onboarding (Calendly, Cal.com…) : utile au statut "signee"
    lienRdv: d.cabinet.lienRdv,
  };

  const ev = await db.evenementSortant.create({
    data: { cabinetId: d.cabinetId, type: payload.evenement, payload: JSON.stringify(payload) },
  });
  await envoyerEvenement(ev.id);
}

export async function envoyerEvenement(id: string) {
  const ev = await db.evenementSortant.findUnique({ where: { id }, include: { cabinet: true } });
  if (!ev || ev.statut === "envoye") return;
  const url = ev.cabinet.webhookUrl;
  if (!url) return; // pas d'automatisation configurée : l'événement reste en attente

  const signature = ev.cabinet.webhookSecret
    ? createHmac("sha256", ev.cabinet.webhookSecret).update(ev.payload).digest("hex")
    : "";
  try {
    const rep = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CRM-Signature": signature },
      body: ev.payload,
      signal: AbortSignal.timeout(10_000),
    });
    if (!rep.ok) throw new Error(`Réponse ${rep.status}`);
    await db.evenementSortant.update({
      where: { id },
      data: { statut: "envoye", envoyeLe: new Date(), tentatives: { increment: 1 }, derniereErreur: null },
    });
  } catch (e) {
    await db.evenementSortant.update({
      where: { id },
      data: { statut: "echec", tentatives: { increment: 1 }, derniereErreur: String((e as Error).message) },
    });
  }
}

/** Renvoie tous les événements non encore transmis (ex. après une coupure Internet). */
export async function renvoyerEnAttente(cabinetId: string) {
  const liste = await db.evenementSortant.findMany({
    where: { cabinetId, statut: { in: ["en_attente", "echec"] } },
    orderBy: { createdAt: "asc" },
    take: 50,
  });
  for (const ev of liste) await envoyerEvenement(ev.id);
}
