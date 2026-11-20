import { NextResponse, type NextRequest } from "next/server";
import { NOM_COOKIE, DUREE_INACTIVITE_S, lireJeton, signerSession } from "@/lib/jeton";

const PUBLIC = ["/connexion", "/installation", "/api/entrant"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname.startsWith(p))) return NextResponse.next();

  const session = await lireJeton(req.cookies.get(NOM_COOKIE)?.value);
  if (!session) return NextResponse.redirect(new URL("/connexion", req.url));
  if (!session.mfa) return NextResponse.redirect(new URL("/connexion/double-authentification", req.url));

  // Prolonge la session à chaque action (déconnexion après 30 min d'inactivité)
  const rep = NextResponse.next();
  rep.cookies.set(NOM_COOKIE, await signerSession(session), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && process.env.HTTPS !== "0",
    path: "/",
    maxAge: DUREE_INACTIVITE_S,
  });
  return rep;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
