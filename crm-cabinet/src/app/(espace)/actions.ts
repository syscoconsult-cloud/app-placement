"use server";

import { randomBytes } from "node:crypto";
import { hash } from "@node-rs/argon2";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { ErreurMetier } from "@/lib/erreurs";
import { exigerUtilisateur, exigerAdmin } from "@/lib/session";
import { journaliser } from "@/lib/audit";
import { verifierTransition } from "@/lib/pipeline";
import { calculerRisque, dateProchaineRevue, CRITERES_LCBFT, type Niveau } from "@/lib/lcbft";
import { evenementChangementStatut, renvoyerEnAttente } from "@/lib/automatisations";

// ---------- utilitaires de lecture des formulaires ----------
const txt = (f: FormData, k: string) => {
  const v = String(f.get(k) ?? "").trim();
  return v === "" ? null : v;
};
const nb = (f: FormData, k: string) => {
  const v = txt(f, k);
  if (v === null) return null;
  const n = Number(v.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
const dt = (f: FormData, k: string) => {
  const v = txt(f, k);
  return v ? new Date(v) : null;
};
const coche = (f: FormData, k: string) => f.get(k) === "on";

async function dossierDuCabinet(id: string, cid: string) {
  const d = await db.dossier.findFirst({
    where: { id, cabinetId: cid },
    include: { acceptation: true, lcbft: true },
  });
  if (!d) throw new ErreurMetier("Dossier introuvable.");
  return d;
}

// ---------- dossiers ----------
async function creerDossier(f: FormData) {
  const s = await exigerUtilisateur();
  const raisonSociale = txt(f, "raisonSociale");
  if (!raisonSociale) throw new ErreurMetier("La raison sociale est obligatoire.");

  const entite = await db.entite.create({
    data: {
      cabinetId: s.cid,
      raisonSociale,
      siren: txt(f, "siren"),
      formeJuridique: txt(f, "formeJuridique"),
      activite: txt(f, "activite"),
      adresse: txt(f, "adresse"),
    },
  });
  if (txt(f, "contactNom")) {
    await db.personne.create({
      data: {
        cabinetId: s.cid,
        entiteId: entite.id,
        prenom: txt(f, "contactPrenom") ?? "",
        nom: txt(f, "contactNom")!,
        email: txt(f, "contactEmail"),
        telephone: txt(f, "contactTelephone"),
        role: txt(f, "contactRole") ?? "dirigeant",
      },
    });
  }
  const dossier = await db.dossier.create({
    data: {
      cabinetId: s.cid,
      entiteId: entite.id,
      type: txt(f, "type") ?? "nouveau",
      source: txt(f, "source"),
      besoin: txt(f, "besoin"),
      typeMission: txt(f, "typeMission"),
      honorairesEstimes: nb(f, "honorairesEstimes"),
      responsableId: s.uid,
      prochaineRelance: dt(f, "prochaineRelance"),
      acceptation: { create: {} },
      lcbft: { create: {} },
    },
  });
  await journaliser(s, "creation", "Dossier", dossier.id, undefined, { raisonSociale });
  redirect(`/dossiers/${dossier.id}`);
}

export async function changerStatut(
  dossierId: string,
  nouveau: string,
  motifRefus?: string,
): Promise<{ ok: boolean; raison?: string }> {
  const s = await exigerUtilisateur();
  const d = await dossierDuCabinet(dossierId, s.cid);
  const verif = verifierTransition(
    {
      statut: d.statut,
      acceptationValidee: d.acceptation?.decision === "acceptee" && !!d.acceptation?.valideLe,
      lcbftValide: !!d.lcbft?.valideLe,
    },
    nouveau,
    motifRefus,
  );
  if (!verif.ok) return { ok: false, raison: verif.raison };
  if (nouveau === d.statut) return { ok: true };

  await db.dossier.update({
    where: { id: d.id },
    data: { statut: nouveau, motifRefus: nouveau === "refuse" ? motifRefus : d.motifRefus },
  });
  await journaliser(s, "changement_statut", "Dossier", d.id, { statut: d.statut }, { statut: nouveau, motifRefus });
  await evenementChangementStatut(d.id, d.statut, nouveau);
  revalidatePath("/dossiers");
  revalidatePath(`/dossiers/${d.id}`);
  return { ok: true };
}

/** Modification d'un champ depuis la vue en liste (édition directe dans le tableau). */
export async function modifierChampDossier(dossierId: string, champ: string, valeur: string) {
  const s = await exigerUtilisateur();
  const d = await dossierDuCabinet(dossierId, s.cid);
  const autorises: Record<string, (v: string) => unknown> = {
    typeMission: (v) => v || null,
    source: (v) => v || null,
    honorairesEstimes: (v) => (v ? Number(v.replace(",", ".")) : null),
    prochaineRelance: (v) => (v ? new Date(v) : null),
    responsableId: (v) => v || null,
  };
  if (!autorises[champ]) throw new ErreurMetier("Champ non modifiable.");
  const val = autorises[champ](valeur);
  await db.dossier.update({ where: { id: d.id }, data: { [champ]: val } });
  await journaliser(s, "modification", "Dossier", d.id, { [champ]: (d as Record<string, unknown>)[champ] }, { [champ]: val });
  revalidatePath("/dossiers");
}

async function majDossier(f: FormData) {
  const s = await exigerUtilisateur();
  const id = String(f.get("id"));
  const avant = await dossierDuCabinet(id, s.cid);
  const data = {
    type: txt(f, "type") ?? "nouveau",
    source: txt(f, "source"),
    besoin: txt(f, "besoin"),
    typeMission: txt(f, "typeMission"),
    honorairesEstimes: nb(f, "honorairesEstimes"),
    prochaineRelance: dt(f, "prochaineRelance"),
    notes: txt(f, "notes"),
  };
  await db.dossier.update({ where: { id }, data });
  await journaliser(s, "modification", "Dossier", id, pick(avant, Object.keys(data)), data);
  revalidatePath(`/dossiers/${id}`);
}

async function majEntite(f: FormData) {
  const s = await exigerUtilisateur();
  const id = String(f.get("id"));
  const avant = await db.entite.findFirstOrThrow({ where: { id, cabinetId: s.cid } });
  const data = {
    raisonSociale: txt(f, "raisonSociale") ?? avant.raisonSociale,
    siren: txt(f, "siren"),
    formeJuridique: txt(f, "formeJuridique"),
    codeNaf: txt(f, "codeNaf"),
    activite: txt(f, "activite"),
    adresse: txt(f, "adresse"),
    dateCreation: dt(f, "dateCreation"),
    capital: nb(f, "capital"),
    caEstime: nb(f, "caEstime"),
    effectif: nb(f, "effectif") as number | null,
  };
  await db.entite.update({ where: { id }, data });
  await journaliser(s, "modification", "Entite", id, pick(avant, Object.keys(data)), data);
  revalidatePath(`/dossiers/${f.get("dossierId")}`);
}

async function ajouterPersonne(f: FormData) {
  const s = await exigerUtilisateur();
  const entiteId = String(f.get("entiteId"));
  await db.entite.findFirstOrThrow({ where: { id: entiteId, cabinetId: s.cid } });
  const p = await db.personne.create({
    data: {
      cabinetId: s.cid,
      entiteId,
      prenom: txt(f, "prenom") ?? "",
      nom: txt(f, "nom") ?? "",
      role: txt(f, "role") ?? "contact",
      email: txt(f, "email"),
      telephone: txt(f, "telephone"),
      dateNaissance: dt(f, "dateNaissance"),
      lieuNaissance: txt(f, "lieuNaissance"),
      nationalite: txt(f, "nationalite"),
      pourcentageDetention: nb(f, "pourcentageDetention"),
      estPPE: coche(f, "estPPE"),
      dateVerificationIdentite: dt(f, "dateVerificationIdentite"),
    },
  });
  await journaliser(s, "creation", "Personne", p.id, undefined, { nom: p.nom, role: p.role, estPPE: p.estPPE });
  revalidatePath(`/dossiers/${f.get("dossierId")}`);
}

async function supprimerPersonne(f: FormData) {
  const s = await exigerUtilisateur();
  const id = String(f.get("id"));
  const p = await db.personne.findFirstOrThrow({ where: { id, cabinetId: s.cid } });
  await db.personne.delete({ where: { id } });
  await journaliser(s, "suppression", "Personne", id, { nom: p.nom, prenom: p.prenom, role: p.role });
  revalidatePath(`/dossiers/${f.get("dossierId")}`);
}

// ---------- acceptation de mission ----------
async function enregistrerAcceptation(f: FormData) {
  const s = await exigerUtilisateur();
  const dossierId = String(f.get("dossierId"));
  const d = await dossierDuCabinet(dossierId, s.cid);
  if (d.acceptation?.valideLe) throw new ErreurMetier("Acceptation déjà validée : demandez à un admin de la rouvrir.");
  const data = {
    independanceOk: coche(f, "independanceOk"),
    incompatibiliteAucune: coche(f, "incompatibiliteAucune"),
    competenceOk: coche(f, "competenceOk"),
    moyensOk: coche(f, "moyensOk"),
    confrerePrecedent: txt(f, "confrerePrecedent") ?? "aucun",
    confrereNom: txt(f, "confrereNom"),
    confrereDateContact: dt(f, "confrereDateContact"),
    confrereReponse: txt(f, "confrereReponse"),
    commentaire: txt(f, "commentaire"),
    decision: txt(f, "decision") ?? "en_attente",
  };
  await db.acceptation.upsert({ where: { dossierId }, create: { dossierId, ...data }, update: data });
  await journaliser(s, "modification", "Acceptation", dossierId, undefined, data);
  if (d.statut === "lead") await changerStatut(dossierId, "acceptation");
  revalidatePath(`/dossiers/${dossierId}`);
}

async function validerAcceptation(f: FormData) {
  const s = await exigerAdmin();
  const dossierId = String(f.get("dossierId"));
  const d = await dossierDuCabinet(dossierId, s.cid);
  const a = d.acceptation!;
  const manque: string[] = [];
  if (!a.independanceOk) manque.push("indépendance");
  if (!a.incompatibiliteAucune) manque.push("absence d'incompatibilité");
  if (!a.competenceOk) manque.push("compétence");
  if (a.confrerePrecedent === "a_contacter") manque.push("contact du confrère précédent");
  if (a.decision !== "acceptee") manque.push("décision « mission acceptée »");
  if (manque.length) throw new ErreurMetier(`Validation impossible, il manque : ${manque.join(", ")}.`);
  await db.acceptation.update({ where: { dossierId }, data: { valideLe: new Date(), valideParId: s.uid } });
  await journaliser(s, "validation", "Acceptation", dossierId);
  if (d.statut === "lead" || d.statut === "acceptation") await changerStatut(dossierId, "lcbft");
  revalidatePath(`/dossiers/${dossierId}`);
}

// ---------- LCB-FT ----------
async function enregistrerLcbft(f: FormData) {
  const s = await exigerUtilisateur();
  const dossierId = String(f.get("dossierId"));
  const d = await dossierDuCabinet(dossierId, s.cid);
  if (d.lcbft?.valideLe) throw new ErreurMetier("Dossier LCB-FT déjà validé : demandez à un admin de le rouvrir.");

  const criteres: Record<string, boolean> = {};
  for (const c of CRITERES_LCBFT) criteres[c.id] = coche(f, `c_${c.id}`);
  // Si une personne est déclarée PPE dans la fiche, le critère est coché d'office
  const ppe = await db.personne.count({ where: { entiteId: d.entiteId, estPPE: true } });
  if (ppe > 0) criteres.ppe = true;

  const { score, niveau: niveauCalcule } = calculerRisque(criteres);
  const niveauForce = coche(f, "niveauForce");
  const justification = txt(f, "justification");
  if (niveauForce && !justification) throw new ErreurMetier("Une justification est obligatoire pour modifier le niveau calculé.");
  const niveau = (niveauForce ? txt(f, "niveau") : niveauCalcule) as Niveau;

  const data = {
    criteres: JSON.stringify(criteres),
    score,
    niveau,
    niveauForce,
    justification,
    identiteVerifiee: coche(f, "identiteVerifiee"),
    beVerifies: coche(f, "beVerifies"),
    gelVerifieLe: dt(f, "gelVerifieLe"),
    gelResultat: txt(f, "gelResultat"),
  };
  await db.lcbft.upsert({ where: { dossierId }, create: { dossierId, ...data }, update: data });
  await journaliser(s, "modification", "Lcbft", dossierId, undefined, { score, niveau, niveauForce });
  revalidatePath(`/dossiers/${dossierId}`);
}

async function validerLcbft(f: FormData) {
  const s = await exigerAdmin();
  const dossierId = String(f.get("dossierId"));
  const d = await dossierDuCabinet(dossierId, s.cid);
  const l = d.lcbft!;
  const manque: string[] = [];
  if (!l.identiteVerifiee) manque.push("vérification d'identité");
  if (!l.beVerifies) manque.push("vérification des bénéficiaires effectifs");
  if (!l.gelVerifieLe) manque.push("contrôle du gel des avoirs");
  if (l.gelResultat === "correspondance_a_analyser") manque.push("analyse de la correspondance gel des avoirs");
  if (manque.length) throw new ErreurMetier(`Validation impossible, il manque : ${manque.join(", ")}.`);
  await db.lcbft.update({
    where: { dossierId },
    data: { valideLe: new Date(), valideParId: s.uid, prochaineRevue: dateProchaineRevue(l.niveau as Niveau) },
  });
  await journaliser(s, "validation", "Lcbft", dossierId, undefined, { niveau: l.niveau });
  revalidatePath(`/dossiers/${dossierId}`);
}

async function rouvrir(f: FormData) {
  const s = await exigerAdmin();
  const dossierId = String(f.get("dossierId"));
  const quoi = String(f.get("quoi"));
  await dossierDuCabinet(dossierId, s.cid);
  if (quoi === "acceptation")
    await db.acceptation.update({ where: { dossierId }, data: { valideLe: null, valideParId: null } });
  else await db.lcbft.update({ where: { dossierId }, data: { valideLe: null, valideParId: null } });
  await journaliser(s, "reouverture", quoi === "acceptation" ? "Acceptation" : "Lcbft", dossierId);
  revalidatePath(`/dossiers/${dossierId}`);
}

// ---------- paramètres ----------
async function majParametres(f: FormData) {
  const s = await exigerAdmin();
  const data = { nom: txt(f, "nom") ?? "Mon cabinet", lienRdv: txt(f, "lienRdv"), webhookUrl: txt(f, "webhookUrl") };
  if (data.webhookUrl && !/^https:\/\//.test(data.webhookUrl))
    throw new ErreurMetier("L'adresse du webhook doit commencer par https://");
  await db.cabinet.update({ where: { id: s.cid }, data });
  await journaliser(s, "modification", "Cabinet", s.cid, undefined, data);
  revalidatePath("/parametres");
}

async function genererCles() {
  const s = await exigerAdmin();
  await db.cabinet.update({
    where: { id: s.cid },
    data: { webhookSecret: randomBytes(24).toString("hex"), apiCleEntrante: randomBytes(24).toString("hex") },
  });
  await journaliser(s, "generation_cles", "Cabinet", s.cid);
  revalidatePath("/parametres");
}

async function renvoyerEvenements() {
  const s = await exigerAdmin();
  await renvoyerEnAttente(s.cid);
  revalidatePath("/parametres");
}

async function ajouterUtilisateur(f: FormData) {
  const s = await exigerAdmin();
  const mdp = String(f.get("motDePasse") || "");
  if (mdp.length < 12) throw new ErreurMetier("Mot de passe : 12 caractères minimum.");
  const u = await db.utilisateur.create({
    data: {
      cabinetId: s.cid,
      nom: txt(f, "nom") ?? "",
      email: (txt(f, "email") ?? "").toLowerCase(),
      role: txt(f, "role") === "admin" ? "admin" : "collaborateur",
      motDePasseHash: await hash(mdp),
    },
  });
  await journaliser(s, "creation", "Utilisateur", u.id, undefined, { email: u.email, role: u.role });
  revalidatePath("/parametres");
}

function pick(o: object, cles: string[]) {
  const r: Record<string, unknown> = {};
  for (const k of cles) r[k] = (o as Record<string, unknown>)[k];
  return r;
}

// ---------- point d'entrée unique des formulaires ----------
// Les formulaires appellent `formulaire.bind(null, "nomAction")` : les erreurs métier
// sont renvoyées à l'écran au lieu de faire planter la page.
export type ResultatFormulaire = { ok?: boolean; erreur?: string } | undefined;

const ACTIONS_FORMULAIRE: Record<string, (f: FormData) => Promise<unknown>> = {
  creerDossier, majDossier, majEntite, ajouterPersonne, supprimerPersonne,
  enregistrerAcceptation, validerAcceptation, enregistrerLcbft, validerLcbft, rouvrir,
  majParametres, genererCles, renvoyerEvenements, ajouterUtilisateur,
};

export async function formulaire(nom: string, _prec: ResultatFormulaire, f: FormData): Promise<ResultatFormulaire> {
  const fn = ACTIONS_FORMULAIRE[nom];
  if (!fn) return { erreur: "Action inconnue." };
  try {
    await fn(f);
    return { ok: true };
  } catch (e) {
    if (e instanceof ErreurMetier) return { erreur: e.message };
    throw e; // redirections et erreurs techniques
  }
}
