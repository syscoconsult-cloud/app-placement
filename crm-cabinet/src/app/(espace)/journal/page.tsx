import { db } from "@/lib/db";
import { exigerAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function Journal({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const s = await exigerAdmin();
  const q = (await searchParams).q?.trim();
  const lignes = await db.journalAudit.findMany({
    where: {
      cabinetId: s.cid,
      ...(q ? { OR: [{ utilisateurNom: { contains: q } }, { action: { contains: q } }, { objetType: { contains: q } }, { apres: { contains: q } }] } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold">Journal d&apos;audit</h1>
      <p className="mb-4 text-sm text-slate-500">Toutes les actions réalisées dans le CRM. Ce journal ne peut être ni modifié ni supprimé.</p>
      <form className="mb-3"><input name="q" defaultValue={q} placeholder="Filtrer (utilisateur, action, contenu…)" className="champ w-80" /></form>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr><th className="px-3 py-2">Date</th><th className="px-3 py-2">Utilisateur</th><th className="px-3 py-2">Action</th><th className="px-3 py-2">Objet</th><th className="px-3 py-2">Détail</th></tr>
          </thead>
          <tbody>
            {lignes.map((j) => (
              <tr key={j.id} className="border-t border-slate-100 align-top">
                <td className="whitespace-nowrap px-3 py-2 text-slate-500">{j.createdAt.toLocaleString("fr-FR")}</td>
                <td className="px-3 py-2">{j.utilisateurNom ?? "Système"}</td>
                <td className="px-3 py-2">{j.action.replace(/_/g, " ")}</td>
                <td className="px-3 py-2">{j.objetType}</td>
                <td className="max-w-xl px-3 py-2 font-mono text-xs text-slate-500">{j.avant && <div>avant : {j.avant}</div>}{j.apres && <div>après : {j.apres}</div>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
