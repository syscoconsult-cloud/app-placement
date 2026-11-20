// Point d'entrée pour Make / n8n : permet à une automatisation de faire avancer un dossier
// (ex. « la lettre de mission a été signée » ou « le rendez-vous d'onboarding est pris »).
// Accessible seulement si le CRM est joignable depuis Internet (version serveur, ou tunnel).
// En local sans tunnel, utilisez plutôt le bouton de statut dans la fiche.
//
// POST /api/entrant
// En-tête : Authorization: Bearer <clé d'API entrante>
// Corps   : { "dossierId": "...", "statut": "signee" | "onboarding" | "client_actif" }

import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { journaliser } from "@/lib/audit";
import { verifierTransition } from "@/lib/pipeline";
import { evenementChangementStatut } from "@/lib/automatisations";

const STATUTS_AUTORISES = ["signee", "onboarding", "client_actif"];

function memeCle(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function POST(req: Request) {
  const cle = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  let corps: { dossierId?: string; statut?: string };
  try { corps = await req.json(); } catch { return NextResponse.json({ erreur: "JSON invalide" }, { status: 400 }); }
  if (!corps.dossierId || !corps.statut || !STATUTS_AUTORISES.includes(corps.statut))
    return NextResponse.json({ erreur: `dossierId et statut (${STATUTS_AUTORISES.join(", ")}) requis` }, { status: 400 });

  const d = await db.dossier.findUnique({ where: { id: corps.dossierId }, include: { cabinet: true, acceptation: true, lcbft: true } });
  if (!d || !d.cabinet.apiCleEntrante || !cle || !memeCle(cle, d.cabinet.apiCleEntrante))
    return NextResponse.json({ erreur: "Non autorisé" }, { status: 401 });

  const v = verifierTransition({
    statut: d.statut,
    acceptationValidee: d.acceptation?.decision === "acceptee" && !!d.acceptation.valideLe,
    lcbftValide: !!d.lcbft?.valideLe,
  }, corps.statut);
  if (!v.ok) return NextResponse.json({ erreur: v.raison }, { status: 409 });
  if (d.statut === corps.statut) return NextResponse.json({ ok: true, inchange: true });

  await db.dossier.update({ where: { id: d.id }, data: { statut: corps.statut } });
  await journaliser({ uid: null, cid: d.cabinetId, nom: "Automatisation" }, "changement_statut", "Dossier", d.id, { statut: d.statut }, { statut: corps.statut });
  await evenementChangementStatut(d.id, d.statut, corps.statut);
  return NextResponse.json({ ok: true });
}
