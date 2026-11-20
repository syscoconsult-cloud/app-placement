import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { installer } from "../actions-auth";
import { CadreAuth, FormulaireAuth } from "@/components/FormulaireAuth";

export const dynamic = "force-dynamic";

export default async function Installation() {
  if ((await db.utilisateur.count()) > 0) redirect("/connexion");
  return (
    <CadreAuth titre="Premier lancement : créez votre cabinet et votre compte administrateur.">
      <FormulaireAuth action={installer} bouton="Créer le cabinet">
        <div><label className="etiquette">Nom du cabinet</label><input name="cabinet" className="champ" required /></div>
        <div>
          <label className="etiquette">Pays</label>
          <select name="pays" className="champ"><option value="FR">France</option><option value="BJ">Bénin</option></select>
        </div>
        <div><label className="etiquette">Votre nom</label><input name="nom" className="champ" required /></div>
        <div><label className="etiquette">E-mail</label><input name="email" type="email" className="champ" required /></div>
        <div><label className="etiquette">Mot de passe (12 caractères minimum)</label><input name="motDePasse" type="password" minLength={12} className="champ" required /></div>
      </FormulaireAuth>
    </CadreAuth>
  );
}
