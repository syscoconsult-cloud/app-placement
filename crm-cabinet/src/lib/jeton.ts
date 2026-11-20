// Jeton de session signé (utilisable aussi dans le middleware).
import { SignJWT, jwtVerify } from "jose";

export const NOM_COOKIE = "crm_session";
export const DUREE_INACTIVITE_S = 30 * 60; // déconnexion après 30 min d'inactivité

export type Session = {
  uid: string;
  cid: string; // cabinet
  role: "admin" | "collaborateur";
  nom: string;
  mfa: boolean; // true si la double authentification a été validée
};

const cle = () => new TextEncoder().encode(process.env.SESSION_SECRET || "");

export async function signerSession(s: Session): Promise<string> {
  return new SignJWT({ ...s })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${DUREE_INACTIVITE_S}s`)
    .sign(cle());
}

export async function lireJeton(jeton?: string): Promise<Session | null> {
  if (!jeton) return null;
  try {
    const { payload } = await jwtVerify(jeton, cle());
    return payload as unknown as Session;
  } catch {
    return null;
  }
}
