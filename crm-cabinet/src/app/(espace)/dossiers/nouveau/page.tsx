import { Formulaire } from "@/components/Formulaire";
import { TYPES_MISSION, SOURCES, ROLES_PERSONNE } from "@/lib/constantes";

export default function NouveauDossier() {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-4 text-xl font-semibold">Nouveau dossier</h1>
      <Formulaire action="creerDossier" bouton="Créer le dossier" className="space-y-6">
        <section className="carte grid gap-4 sm:grid-cols-2">
          <h2 className="font-medium sm:col-span-2">Entité</h2>
          <div className="sm:col-span-2"><label className="etiquette">Raison sociale *</label><input name="raisonSociale" className="champ" required /></div>
          <div><label className="etiquette">SIREN (France) / IFU (Bénin)</label><input name="siren" className="champ" /></div>
          <div><label className="etiquette">Forme juridique</label><input name="formeJuridique" placeholder="SAS, SARL, EI…" className="champ" /></div>
          <div><label className="etiquette">Activité</label><input name="activite" className="champ" /></div>
          <div><label className="etiquette">Adresse</label><input name="adresse" className="champ" /></div>
        </section>
        <section className="carte grid gap-4 sm:grid-cols-2">
          <h2 className="font-medium sm:col-span-2">Contact principal</h2>
          <div><label className="etiquette">Prénom</label><input name="contactPrenom" className="champ" /></div>
          <div><label className="etiquette">Nom</label><input name="contactNom" className="champ" /></div>
          <div><label className="etiquette">E-mail</label><input name="contactEmail" type="email" className="champ" /></div>
          <div><label className="etiquette">Téléphone</label><input name="contactTelephone" className="champ" /></div>
          <div>
            <label className="etiquette">Rôle</label>
            <select name="contactRole" className="champ" defaultValue="dirigeant">
              {ROLES_PERSONNE.map((r) => <option key={r.id} value={r.id}>{r.libelle}</option>)}
            </select>
          </div>
        </section>
        <section className="carte grid gap-4 sm:grid-cols-2">
          <h2 className="font-medium sm:col-span-2">Opportunité</h2>
          <div>
            <label className="etiquette">Type</label>
            <select name="type" className="champ"><option value="nouveau">Nouvelle mission</option><option value="renouvellement">Renouvellement</option></select>
          </div>
          <div>
            <label className="etiquette">Mission envisagée</label>
            <select name="typeMission" className="champ"><option value="">—</option>{TYPES_MISSION.map((t) => <option key={t.id} value={t.id}>{t.libelle}</option>)}</select>
          </div>
          <div>
            <label className="etiquette">Source</label>
            <select name="source" className="champ"><option value="">—</option>{SOURCES.map((s) => <option key={s}>{s}</option>)}</select>
          </div>
          <div><label className="etiquette">Honoraires annuels estimés (€)</label><input name="honorairesEstimes" inputMode="decimal" className="champ" /></div>
          <div><label className="etiquette">Prochaine relance</label><input name="prochaineRelance" type="date" className="champ" /></div>
          <div className="sm:col-span-2"><label className="etiquette">Besoin exprimé</label><textarea name="besoin" rows={3} className="champ" /></div>
        </section>
      </Formulaire>
    </div>
  );
}
