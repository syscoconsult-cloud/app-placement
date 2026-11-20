import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ErreurMetier } from "./erreurs";
import { NOM_COOKIE, DUREE_INACTIVITE_S, lireJeton, signerSession, type Session } from "./jeton";

export async function ouvrirSession(s: Session) {
  const c = await cookies();
  c.set(NOM_COOKIE, await signerSession(s), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && process.env.HTTPS !== "0",
    path: "/",
    maxAge: DUREE_INACTIVITE_S,
  });
}

export async function fermerSession() {
  (await cookies()).delete(NOM_COOKIE);
}

export async function sessionCourante(): Promise<Session | null> {
  return lireJeton((await cookies()).get(NOM_COOKIE)?.value);
}

/** Exige un utilisateur connecté avec double authentification validée. */
export async function exigerUtilisateur(): Promise<Session> {
  const s = await sessionCourante();
  if (!s) redirect("/connexion");
  if (!s.mfa) redirect("/connexion/double-authentification");
  return s;
}

export async function exigerAdmin(): Promise<Session> {
  const s = await exigerUtilisateur();
  if (s.role !== "admin") throw new ErreurMetier("Action réservée à un administrateur.");
  return s;
}
