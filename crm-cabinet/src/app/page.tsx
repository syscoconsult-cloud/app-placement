import { redirect } from "next/navigation";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Accueil() {
  if ((await db.utilisateur.count()) === 0) redirect("/installation");
  redirect("/dossiers");
}
