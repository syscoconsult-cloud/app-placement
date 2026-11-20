import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { exigerUtilisateur } from "@/lib/session";
import { Formulaire } from "@/components/Formulaire";
import { ChangerStatut } from "@/components/ChangerStatut";
import { TYPES_MISSION, SOURCES, ROLES_PERSONNE, libelleRolePersonne, couleurStatut, libelleStatut } from "@/lib/constantes";
import { CRITERES_LCBFT, LIBELLES_NIVEAU, calculerRisque, type Niveau } from "@/lib/lcbft";

export const dynamic = "force-dynamic";

const ONGLETS = [
  { id: "synthese", titre: "Synthèse" },
  { id: "personnes", titre: "Personnes" },
  { id: "acceptation", titre: "Acceptation" },
  { id: "lcbft", titre: "LCB-FT" },
  { id: "historique", titre: "Historique" },
];
const jour = (d?: Date | null) => (d ? d.toISOString().slice(0, 10) : "");
const fr = (d?: Date | null) => (d ? d.toLocaleDateString("fr-FR") : "—");

export default async function FicheDossier({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams: Promise<{ onglet?: string }> }) {
  const s = await exigerUtilisateur();
  const { id } = await params;
  const onglet = (await searchParams).onglet ?? "synthese";
  const d = await db.dossier.findFirst({
    where: { id, cabinetId: s.cid },
    include: { entite: { include: { personnes: { orderBy: { createdAt: "asc" } } } }, acceptation: true, lcbft: true },
  });
  if (!d) notFound();
  const admin = s.role === "admin";

  return (
    <div>
      <Link href="/dossiers" className="text-sm text-slate-500 hover:text-slate-800">← Dossiers</Link>
      <div className="mb-4 mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{d.entite.raisonSociale}</h1>
        <span className={`pastille ${couleurStatut(d.statut)}`}>{libelleStatut(d.statut)}</span>
        {d.type === "renouvellement" && <span className="pastille bg-slate-100 text-slate-600">Renouvellement</span>}
      </div>
      <div className="carte mb-4"><ChangerStatut dossierId={d.id} statut={d.statut} />
        {d.statut === "refuse" && d.motifRefus && <p className="mt-2 text-sm text-red-700">Motif du refus : {d.motifRefus}</p>}
      </div>

      <nav className="mb-4 flex gap-1 border-b border-slate-200">
        {ONGLETS.map((o) => (
          <Link key={o.id} href={`?onglet=${o.id}`}
            className={`-mb-px border-b-2 px-4 py-2 text-sm ${onglet === o.id ? "border-indigo-600 font-medium text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
            {o.titre}
            {o.id === "acceptation" && d.acceptation?.valideLe && " ✓"}
            {o.id === "lcbft" && d.lcbft?.valideLe && " ✓"}
          </Link>
        ))}
      </nav>

      {onglet === "synthese" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Formulaire action="majDossier" bouton="Enregistrer" className="carte grid gap-4 sm:grid-cols-2">
            <h2 className="font-medium sm:col-span-2">Opportunité</h2>
            <input type="hidden" name="id" value={d.id} />
            <div><label className="etiquette">Type</label>
              <select name="type" defaultValue={d.type} className="champ"><option value="nouveau">Nouvelle mission</option><option value="renouvellement">Renouvellement</option></select></div>
            <div><label className="etiquette">Mission</label>
              <select name="typeMission" defaultValue={d.typeMission ?? ""} className="champ"><option value="">—</option>{TYPES_MISSION.map((t) => <option key={t.id} value={t.id}>{t.libelle}</option>)}</select></div>
            <div><label className="etiquette">Source</label>
              <select name="source" defaultValue={d.source ?? ""} className="champ"><option value="">—</option>{SOURCES.map((x) => <option key={x}>{x}</option>)}</select></div>
            <div><label className="etiquette">Honoraires estimés (€)</label><input name="honorairesEstimes" defaultValue={d.honorairesEstimes ?? ""} className="champ" /></div>
            <div><label className="etiquette">Prochaine relance</label><input type="date" name="prochaineRelance" defaultValue={jour(d.prochaineRelance)} className="champ" /></div>
            <div className="sm:col-span-2"><label className="etiquette">Besoin exprimé</label><textarea name="besoin" defaultValue={d.besoin ?? ""} rows={3} className="champ" /></div>
            <div className="sm:col-span-2"><label className="etiquette">Notes</label><textarea name="notes" defaultValue={d.notes ?? ""} rows={4} className="champ" /></div>
          </Formulaire>
          <Formulaire action="majEntite" bouton="Enregistrer" className="carte grid gap-4 sm:grid-cols-2">
            <h2 className="font-medium sm:col-span-2">Entité</h2>
            <input type="hidden" name="id" value={d.entite.id} /><input type="hidden" name="dossierId" value={d.id} />
            <div className="sm:col-span-2"><label className="etiquette">Raison sociale</label><input name="raisonSociale" defaultValue={d.entite.raisonSociale} className="champ" /></div>
            <div><label className="etiquette">SIREN / IFU</label><input name="siren" defaultValue={d.entite.siren ?? ""} className="champ" /></div>
            <div><label className="etiquette">Forme juridique</label><input name="formeJuridique" defaultValue={d.entite.formeJuridique ?? ""} className="champ" /></div>
            <div><label className="etiquette">Code NAF</label><input name="codeNaf" defaultValue={d.entite.codeNaf ?? ""} className="champ" /></div>
            <div><label className="etiquette">Date de création</label><input type="date" name="dateCreation" defaultValue={jour(d.entite.dateCreation)} className="champ" /></div>
            <div className="sm:col-span-2"><label className="etiquette">Activité</label><input name="activite" defaultValue={d.entite.activite ?? ""} className="champ" /></div>
            <div className="sm:col-span-2"><label className="etiquette">Adresse</label><input name="adresse" defaultValue={d.entite.adresse ?? ""} className="champ" /></div>
            <div><label className="etiquette">Capital (€)</label><input name="capital" defaultValue={d.entite.capital ?? ""} className="champ" /></div>
            <div><label className="etiquette">CA estimé (€)</label><input name="caEstime" defaultValue={d.entite.caEstime ?? ""} className="champ" /></div>
            <div><label className="etiquette">Effectif</label><input name="effectif" defaultValue={d.entite.effectif ?? ""} className="champ" /></div>
          </Formulaire>
        </div>
      )}

      {onglet === "personnes" && (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr><th className="px-3 py-2">Nom</th><th className="px-3 py-2">Rôle</th><th className="px-3 py-2">Détention</th><th className="px-3 py-2">PPE</th><th className="px-3 py-2">Contact</th><th className="px-3 py-2">Identité vérifiée le</th><th /></tr>
              </thead>
              <tbody>
                {d.entite.personnes.map((p) => (
                  <tr key={p.id} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-medium">{p.prenom} {p.nom}</td>
                    <td className="px-3 py-2">{libelleRolePersonne(p.role)}</td>
                    <td className="px-3 py-2">{p.pourcentageDetention != null ? `${p.pourcentageDetention} %` : "—"}</td>
                    <td className="px-3 py-2">{p.estPPE ? <span className="pastille bg-red-100 text-red-700">PPE</span> : "Non"}</td>
                    <td className="px-3 py-2 text-slate-600">{p.email ?? ""} {p.telephone ?? ""}</td>
                    <td className="px-3 py-2">{fr(p.dateVerificationIdentite)}</td>
                    <td className="px-3 py-2 text-right">
                      <Formulaire action="supprimerPersonne" bouton="Supprimer" boutonClasse="text-xs text-red-600 underline" className="" confirmer={`Supprimer ${p.prenom} ${p.nom} ?`}>
                        <input type="hidden" name="id" value={p.id} /><input type="hidden" name="dossierId" value={d.id} />
                      </Formulaire>
                    </td>
                  </tr>
                ))}
                {d.entite.personnes.length === 0 && <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-400">Aucune personne.</td></tr>}
              </tbody>
            </table>
          </div>
          <Formulaire action="ajouterPersonne" bouton="Ajouter la personne" vider className="carte grid gap-4 sm:grid-cols-3">
            <h2 className="font-medium sm:col-span-3">Ajouter un dirigeant, bénéficiaire effectif ou contact</h2>
            <input type="hidden" name="entiteId" value={d.entite.id} /><input type="hidden" name="dossierId" value={d.id} />
            <div><label className="etiquette">Prénom</label><input name="prenom" className="champ" required /></div>
            <div><label className="etiquette">Nom</label><input name="nom" className="champ" required /></div>
            <div><label className="etiquette">Rôle</label><select name="role" className="champ">{ROLES_PERSONNE.map((r) => <option key={r.id} value={r.id}>{r.libelle}</option>)}</select></div>
            <div><label className="etiquette">E-mail</label><input name="email" type="email" className="champ" /></div>
            <div><label className="etiquette">Téléphone</label><input name="telephone" className="champ" /></div>
            <div><label className="etiquette">% de détention</label><input name="pourcentageDetention" inputMode="decimal" className="champ" /></div>
            <div><label className="etiquette">Date de naissance</label><input name="dateNaissance" type="date" className="champ" /></div>
            <div><label className="etiquette">Lieu de naissance</label><input name="lieuNaissance" className="champ" /></div>
            <div><label className="etiquette">Nationalité</label><input name="nationalite" className="champ" /></div>
            <div><label className="etiquette">Identité vérifiée le</label><input name="dateVerificationIdentite" type="date" className="champ" /></div>
            <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" name="estPPE" /> Personne politiquement exposée (PPE)</label>
          </Formulaire>
        </div>
      )}

      {onglet === "acceptation" && d.acceptation && (() => {
        const a = d.acceptation;
        const verrou = !!a.valideLe;
        return (
          <div className="grid gap-4 lg:grid-cols-3">
            <Formulaire action="enregistrerAcceptation" bouton="Enregistrer" className="carte space-y-4 lg:col-span-2">
              <h2 className="font-medium">Prise de connaissance et acceptation de la mission</h2>
              <p className="text-sm text-slate-500">Code de déontologie des experts-comptables. Ces éléments alimenteront la fiche d&apos;acceptation générée automatiquement.</p>
              <input type="hidden" name="dossierId" value={d.id} />
              <fieldset disabled={verrou} className="space-y-3">
                {[
                  ["independanceOk", "Indépendance vérifiée (aucun lien personnel, financier ou d'intérêt avec le client)", a.independanceOk],
                  ["incompatibiliteAucune", "Aucune incompatibilité avec d'autres missions ou fonctions", a.incompatibiliteAucune],
                  ["competenceOk", "Compétences disponibles pour réaliser la mission", a.competenceOk],
                  ["moyensOk", "Moyens humains et temps disponibles", a.moyensOk],
                ].map(([n, l, v]) => (
                  <label key={n as string} className="flex items-start gap-2 text-sm">
                    <input type="checkbox" name={n as string} defaultChecked={v as boolean} className="mt-0.5" /> {l as string}
                  </label>
                ))}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div><label className="etiquette">Confrère précédent</label>
                    <select name="confrerePrecedent" defaultValue={a.confrerePrecedent} className="champ">
                      <option value="aucun">Pas de confrère précédent</option>
                      <option value="a_contacter">À contacter</option>
                      <option value="contacte">Contacté</option>
                    </select></div>
                  <div><label className="etiquette">Nom du confrère</label><input name="confrereNom" defaultValue={a.confrereNom ?? ""} className="champ" /></div>
                  <div><label className="etiquette">Date du contact</label><input type="date" name="confrereDateContact" defaultValue={jour(a.confrereDateContact)} className="champ" /></div>
                  <div><label className="etiquette">Réponse du confrère</label><input name="confrereReponse" defaultValue={a.confrereReponse ?? ""} placeholder="Honoraires réglés, pas d'objection…" className="champ" /></div>
                </div>
                <div><label className="etiquette">Commentaire</label><textarea name="commentaire" defaultValue={a.commentaire ?? ""} rows={3} className="champ" /></div>
                <div><label className="etiquette">Décision</label>
                  <select name="decision" defaultValue={a.decision} className="champ sm:w-64">
                    <option value="en_attente">En attente</option><option value="acceptee">Mission acceptée</option><option value="refusee">Mission refusée</option>
                  </select></div>
              </fieldset>
            </Formulaire>
            <Validation titre="Validation de l'acceptation" quoi="acceptation" valideLe={a.valideLe} admin={admin} dossierId={d.id}
              actionValider="validerAcceptation" aide="Réservé à l'expert-comptable (admin). Vérifie que tous les points sont cochés et la décision « acceptée »." />
          </div>
        );
      })()}

      {onglet === "lcbft" && d.lcbft && (() => {
        const l = d.lcbft;
        const verrou = !!l.valideLe;
        const criteres = JSON.parse(l.criteres || "{}") as Record<string, boolean>;
        const ppeFiche = d.entite.personnes.some((p) => p.estPPE);
        const calc = calculerRisque({ ...criteres, ppe: criteres.ppe || ppeFiche });
        return (
          <div className="grid gap-4 lg:grid-cols-3">
            <Formulaire action="enregistrerLcbft" bouton="Enregistrer et recalculer" className="carte space-y-4 lg:col-span-2">
              <h2 className="font-medium">Lutte contre le blanchiment et le financement du terrorisme</h2>
              <input type="hidden" name="dossierId" value={d.id} />
              <fieldset disabled={verrou} className="space-y-4">
                <div>
                  <h3 className="mb-2 text-sm font-medium text-slate-700">Obligations d&apos;identification</h3>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="identiteVerifiee" defaultChecked={l.identiteVerifiee} /> Identité du client et du dirigeant vérifiée (pièce d&apos;identité, Kbis / RCCM)</label>
                  <label className="mt-1 flex items-center gap-2 text-sm"><input type="checkbox" name="beVerifies" defaultChecked={l.beVerifies} /> Bénéficiaires effectifs identifiés et vérifiés</label>
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    <div><label className="etiquette">Contrôle du gel des avoirs effectué le</label><input type="date" name="gelVerifieLe" defaultValue={jour(l.gelVerifieLe)} className="champ" /></div>
                    <div><label className="etiquette">Résultat</label>
                      <select name="gelResultat" defaultValue={l.gelResultat ?? ""} className="champ">
                        <option value="">—</option><option value="aucune_correspondance">Aucune correspondance</option><option value="correspondance_a_analyser">Correspondance à analyser</option>
                      </select></div>
                  </div>
                </div>
                <div>
                  <h3 className="mb-2 text-sm font-medium text-slate-700">Facteurs de risque</h3>
                  <div className="space-y-1.5">
                    {CRITERES_LCBFT.map((c) => (
                      <label key={c.id} className="flex items-start gap-2 text-sm">
                        <input type="checkbox" name={`c_${c.id}`} defaultChecked={criteres[c.id] || (c.id === "ppe" && ppeFiche)} className="mt-0.5" />
                        <span>{c.libelle} <span className="text-xs text-slate-400">(+{c.points})</span>
                          {c.id === "ppe" && ppeFiche && <span className="ml-1 text-xs text-red-600">coché d&apos;office : une personne PPE figure dans la fiche</span>}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="rounded-md bg-slate-50 p-3">
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="niveauForce" defaultChecked={l.niveauForce} /> Modifier le niveau calculé</label>
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    <select name="niveau" defaultValue={l.niveau} className="champ">
                      {(Object.keys(LIBELLES_NIVEAU) as Niveau[]).map((n) => <option key={n} value={n}>{LIBELLES_NIVEAU[n]}</option>)}
                    </select>
                    <input name="justification" defaultValue={l.justification ?? ""} placeholder="Justification (obligatoire)" className="champ" />
                  </div>
                </div>
              </fieldset>
            </Formulaire>
            <div className="space-y-4">
              <div className="carte">
                <div className="text-xs uppercase text-slate-500">Niveau de vigilance</div>
                <div className={`mt-1 text-lg font-semibold ${l.niveau === "renforce" ? "text-red-700" : l.niveau === "faible" ? "text-emerald-700" : "text-amber-700"}`}>
                  {LIBELLES_NIVEAU[l.niveau as Niveau]}
                </div>
                <div className="mt-1 text-sm text-slate-500">Score enregistré : {l.score} pts{l.niveauForce ? " · niveau modifié manuellement" : ""}</div>
                {!verrou && calc.score !== l.score && <div className="mt-1 text-xs text-amber-700">Score recalculé : {calc.score} pts (enregistrez pour mettre à jour)</div>}
                {l.prochaineRevue && <div className="mt-3 text-sm">Prochaine revue : <strong>{fr(l.prochaineRevue)}</strong></div>}
              </div>
              <Validation titre="Validation LCB-FT" quoi="lcbft" valideLe={l.valideLe} admin={admin} dossierId={d.id}
                actionValider="validerLcbft" aide="Réservé à l'expert-comptable (admin). Exige identité, bénéficiaires effectifs et gel des avoirs contrôlés." />
            </div>
          </div>
        );
      })()}

      {onglet === "historique" && <Historique dossierId={d.id} entiteId={d.entite.id} cabinetId={s.cid} />}
    </div>
  );
}

function Validation({ titre, quoi, valideLe, admin, dossierId, actionValider, aide }: {
  titre: string; quoi: string; valideLe: Date | null; admin: boolean; dossierId: string; actionValider: string; aide: string;
}) {
  return (
    <div className="carte space-y-3">
      <h2 className="font-medium">{titre}</h2>
      {valideLe ? (
        <>
          <p className="rounded-md bg-emerald-50 p-2 text-sm text-emerald-800">✓ Validé le {valideLe.toLocaleString("fr-FR")}</p>
          {admin && (
            <Formulaire action="rouvrir" bouton="Rouvrir pour modification" boutonClasse="btn-sec" className="" confirmer="Rouvrir ce dossier ? L'action sera tracée dans le journal.">
              <input type="hidden" name="dossierId" value={dossierId} /><input type="hidden" name="quoi" value={quoi} />
            </Formulaire>
          )}
        </>
      ) : admin ? (
        <Formulaire action={actionValider} bouton="Valider" className="space-y-2" confirmer="Confirmez-vous la validation ? Elle sera horodatée et tracée.">
          <input type="hidden" name="dossierId" value={dossierId} />
          <p className="text-xs text-slate-500">{aide}</p>
        </Formulaire>
      ) : (
        <p className="text-sm text-slate-500">En attente de validation par l&apos;expert-comptable.</p>
      )}
    </div>
  );
}

async function Historique({ dossierId, entiteId, cabinetId }: { dossierId: string; entiteId: string; cabinetId: string }) {
  const lignes = await db.journalAudit.findMany({
    where: { cabinetId, objetId: { in: [dossierId, entiteId] } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return (
    <div className="carte">
      <ul className="divide-y divide-slate-100 text-sm">
        {lignes.map((j) => (
          <li key={j.id} className="flex flex-wrap gap-x-3 py-2">
            <span className="w-36 text-slate-500">{j.createdAt.toLocaleString("fr-FR")}</span>
            <span className="font-medium">{j.utilisateurNom ?? "Système"}</span>
            <span>{j.action.replace(/_/g, " ")} · {j.objetType}</span>
            {j.apres && <span className="truncate text-slate-400">{j.apres.slice(0, 140)}</span>}
          </li>
        ))}
        {lignes.length === 0 && <li className="py-4 text-center text-slate-400">Aucun historique.</li>}
      </ul>
    </div>
  );
}
