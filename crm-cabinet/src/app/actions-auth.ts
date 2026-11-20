"use server";

import { hash, verify } from "@node-rs/argon2";
import { authenticator } from "otplib";
import QRCode from "qrcode";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { ouvrirSession, fermerSession, sessionCourante } from "@/lib/session";
import { journaliser } from "@/lib/audit";

export type EtatFormulaire = { erreur?: string } | undefined;

const MAX_ECHECS = 5;
const VERROU_MIN = 15;

// Premier lancement : création du cabinet et de l'administrateur
export async function installer(_: EtatFormulaire, f: FormData): Promise<EtatFormulaire> {
  if ((await db.utilisateur.count()) > 0) return { erreur: "Le CRM est déjà installé." };
  const cabinet = String(f.get("cabinet") || "").trim();
  const nom = String(f.get("nom") || "").trim();
  const email = String(f.get("email") || "").trim().toLowerCase();
  const mdp = String(f.get("motDePasse") || "");
  if (!cabinet || !nom || !email) return { erreur: "Tous les champs sont obligatoires." };
  if (mdp.length < 12) return { erreur: "Le mot de passe doit contenir au moins 12 caractères." };

  const c = await db.cabinet.create({ data: { nom: cabinet, pays: String(f.get("pays") || "FR") } });
  const u = await db.utilisateur.create({
    data: { cabinetId: c.id, nom, email, role: "admin", motDePasseHash: await hash(mdp) },
  });
  await journaliser({ uid: u.id, cid: c.id, nom }, "installation", "Cabinet", c.id);
  await ouvrirSession({ uid: u.id, cid: c.id, role: "admin", nom, mfa: false });
  redirect("/connexion/double-authentification");
}

export async function connecter(_: EtatFormulaire, f: FormData): Promise<EtatFormulaire> {
  const email = String(f.get("email") || "").trim().toLowerCase();
  const mdp = String(f.get("motDePasse") || "");
  const u = await db.utilisateur.findUnique({ where: { email } });
  const msg = { erreur: "Identifiants incorrects." };
  if (!u || !u.actif) return msg;
  if (u.verrouilleJusqua && u.verrouilleJusqua > new Date())
    return { erreur: `Compte verrouillé après ${MAX_ECHECS} échecs. Réessayez dans ${VERROU_MIN} minutes.` };

  if (!(await verify(u.motDePasseHash, mdp))) {
    const echecs = u.tentativesEchouees + 1;
    await db.utilisateur.update({
      where: { id: u.id },
      data: {
        tentativesEchouees: echecs >= MAX_ECHECS ? 0 : echecs,
        verrouilleJusqua: echecs >= MAX_ECHECS ? new Date(Date.now() + VERROU_MIN * 60_000) : null,
      },
    });
    await journaliser({ uid: u.id, cid: u.cabinetId, nom: u.nom }, "connexion_echouee", "Utilisateur", u.id);
    return msg;
  }
  await db.utilisateur.update({ where: { id: u.id }, data: { tentativesEchouees: 0, verrouilleJusqua: null } });
  await ouvrirSession({ uid: u.id, cid: u.cabinetId, role: u.role as "admin", nom: u.nom, mfa: false });
  redirect("/connexion/double-authentification");
}

/** Prépare l'activation de la 2FA : génère le secret et le QR code à scanner. */
export async function preparerDoubleAuth(): Promise<{ actif: boolean; qr?: string; secret?: string }> {
  const s = await sessionCourante();
  if (!s) redirect("/connexion");
  const u = await db.utilisateur.findUniqueOrThrow({ where: { id: s.uid } });
  if (u.totpActif) return { actif: true };
  let secret = u.totpSecret;
  if (!secret) {
    secret = authenticator.generateSecret();
    await db.utilisateur.update({ where: { id: u.id }, data: { totpSecret: secret } });
  }
  const uri = authenticator.keyuri(u.email, "CRM Cabinet", secret);
  return { actif: false, qr: await QRCode.toDataURL(uri), secret };
}

export async function validerDoubleAuth(_: EtatFormulaire, f: FormData): Promise<EtatFormulaire> {
  const s = await sessionCourante();
  if (!s) redirect("/connexion");
  const u = await db.utilisateur.findUniqueOrThrow({ where: { id: s.uid } });
  const code = String(f.get("code") || "").replace(/\s/g, "");
  if (!u.totpSecret || !authenticator.verify({ token: code, secret: u.totpSecret }))
    return { erreur: "Code incorrect. Vérifiez l'heure de votre téléphone et réessayez." };
  if (!u.totpActif) {
    await db.utilisateur.update({ where: { id: u.id }, data: { totpActif: true } });
    await journaliser(s, "2fa_activee", "Utilisateur", u.id);
  }
  await ouvrirSession({ ...s, mfa: true });
  await journaliser(s, "connexion", "Utilisateur", u.id);
  redirect("/dossiers");
}

export async function deconnecter() {
  await fermerSession();
  redirect("/connexion");
}
