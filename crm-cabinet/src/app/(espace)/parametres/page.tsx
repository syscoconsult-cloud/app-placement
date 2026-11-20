import { db } from "@/lib/db";
import { exigerAdmin } from "@/lib/session";
import { Formulaire } from "@/components/Formulaire";

export const dynamic = "force-dynamic";

export default async function Parametres() {
  const s = await exigerAdmin();
  const c = await db.cabinet.findUniqueOrThrow({ where: { id: s.cid } });
  const utilisateurs = await db.utilisateur.findMany({ where: { cabinetId: s.cid }, orderBy: { createdAt: "asc" } });
  const evenements = await db.evenementSortant.findMany({ where: { cabinetId: s.cid }, orderBy: { createdAt: "desc" }, take: 20 });
  const enAttente = await db.evenementSortant.count({ where: { cabinetId: s.cid, statut: { in: ["en_attente", "echec"] } } });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Paramètres</h1>

      <Formulaire action="majParametres" bouton="Enregistrer" className="carte grid gap-4 md:grid-cols-2">
        <h2 className="font-medium md:col-span-2">Cabinet et automatisations</h2>
        <div><label className="etiquette">Nom du cabinet</label><input name="nom" defaultValue={c.nom} className="champ" /></div>
        <div><label className="etiquette">Lien de prise de rendez-vous d&apos;onboarding (Calendly, Cal.com…)</label>
          <input name="lienRdv" defaultValue={c.lienRdv ?? ""} placeholder="https://calendly.com/votre-cabinet/onboarding-pennylane" className="champ" /></div>
        <div className="md:col-span-2"><label className="etiquette">Adresse du webhook Make ou n8n (reçoit les changements de statut)</label>
          <input name="webhookUrl" defaultValue={c.webhookUrl ?? ""} placeholder="https://hook.eu2.make.com/…" className="champ" />
          <p className="mt-1 text-xs text-slate-500">Seules les données nécessaires sont envoyées : nom de l&apos;entité, SIREN, statut, contact (prénom, nom, e-mail) et lien de rendez-vous. Jamais de pièce d&apos;identité ni d&apos;information LCB-FT.</p></div>
      </Formulaire>

      <div className="carte space-y-3">
        <h2 className="font-medium">Clés de sécurité des automatisations</h2>
        <div className="grid gap-3 text-sm md:grid-cols-2">
          <div><div className="etiquette">Secret de signature (en-tête X-CRM-Signature, HMAC-SHA256)</div><code className="block break-all rounded bg-slate-100 p-2 text-xs">{c.webhookSecret ?? "non généré"}</code></div>
          <div><div className="etiquette">Clé d&apos;API entrante (pour que Make/n8n mette à jour un dossier)</div><code className="block break-all rounded bg-slate-100 p-2 text-xs">{c.apiCleEntrante ?? "non générée"}</code></div>
        </div>
        <Formulaire action="genererCles" bouton={c.webhookSecret ? "Régénérer les clés" : "Générer les clés"} boutonClasse="btn-sec" className=""
          confirmer={c.webhookSecret ? "Les anciennes clés cesseront de fonctionner. Continuer ?" : undefined} />
      </div>

      <div className="carte">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-medium">Événements envoyés aux automatisations</h2>
          {enAttente > 0 && (
            <Formulaire action="renvoyerEvenements" bouton={`Renvoyer ${enAttente} événement(s) en attente`} boutonClasse="btn-sec" className="" />
          )}
        </div>
        <table className="w-full text-sm">
          <tbody>
            {evenements.map((e) => {
              const p = JSON.parse(e.payload);
              return (
                <tr key={e.id} className="border-t border-slate-100">
                  <td className="py-1.5 text-slate-500">{e.createdAt.toLocaleString("fr-FR")}</td>
                  <td className="py-1.5">{p.entite?.raisonSociale} → {p.dossier?.nouveauStatutLibelle}</td>
                  <td className="py-1.5">
                    <span className={`pastille ${e.statut === "envoye" ? "bg-emerald-100 text-emerald-700" : e.statut === "echec" ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600"}`}>
                      {e.statut === "envoye" ? "Envoyé" : e.statut === "echec" ? "Échec" : "En attente"}
                    </span>
                    {e.derniereErreur && <span className="ml-2 text-xs text-red-600">{e.derniereErreur}</span>}
                  </td>
                </tr>
              );
            })}
            {evenements.length === 0 && <tr><td className="py-3 text-slate-400">Aucun événement pour l&apos;instant.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="carte space-y-4">
        <h2 className="font-medium">Utilisateurs</h2>
        <ul className="text-sm">
          {utilisateurs.map((u) => (
            <li key={u.id} className="flex gap-3 border-t border-slate-100 py-1.5">
              <span className="font-medium">{u.nom}</span><span className="text-slate-500">{u.email}</span>
              <span>{u.role === "admin" ? "Admin" : "Collaborateur"}</span>
              <span className={u.totpActif ? "text-emerald-700" : "text-amber-700"}>{u.totpActif ? "2FA active" : "2FA à activer"}</span>
            </li>
          ))}
        </ul>
        <Formulaire action="ajouterUtilisateur" bouton="Ajouter l'utilisateur" vider className="grid gap-3 md:grid-cols-4">
          <input name="nom" placeholder="Nom" className="champ" required />
          <input name="email" type="email" placeholder="E-mail" className="champ" required />
          <input name="motDePasse" type="password" placeholder="Mot de passe provisoire (12+)" minLength={12} className="champ" required />
          <select name="role" className="champ"><option value="collaborateur">Collaborateur</option><option value="admin">Admin</option></select>
        </Formulaire>
      </div>
    </div>
  );
}
