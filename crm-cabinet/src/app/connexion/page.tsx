import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { connecter } from "../actions-auth";
import { CadreAuth, FormulaireAuth } from "@/components/FormulaireAuth";

export const dynamic = "force-dynamic";

export default async function Connexion() {
  if ((await db.utilisateur.count()) === 0) redirect("/installation");
  return (
    <CadreAuth titre="Connectez-vous à votre espace.">
      <FormulaireAuth action={connecter} bouton="Se connecter">
        <div><label className="etiquette">E-mail</label><input name="email" type="email" className="champ" required autoFocus /></div>
        <div><label className="etiquette">Mot de passe</label><input name="motDePasse" type="password" className="champ" required /></div>
      </FormulaireAuth>
    </CadreAuth>
  );
}
