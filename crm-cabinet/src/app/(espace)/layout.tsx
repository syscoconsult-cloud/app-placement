import Link from "next/link";
import { exigerUtilisateur } from "@/lib/session";
import { deconnecter } from "../actions-auth";
import { db } from "@/lib/db";

export default async function Espace({ children }: { children: React.ReactNode }) {
  const s = await exigerUtilisateur();
  const cabinet = await db.cabinet.findUnique({ where: { id: s.cid } });
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/dossiers" className="font-semibold text-indigo-700">{cabinet?.nom ?? "CRM Cabinet"}</Link>
          <nav className="flex gap-4 text-sm text-slate-600">
            <Link href="/dossiers" className="hover:text-slate-900">Dossiers</Link>
            {s.role === "admin" && <Link href="/journal" className="hover:text-slate-900">Journal d&apos;audit</Link>}
            {s.role === "admin" && <Link href="/parametres" className="hover:text-slate-900">Paramètres</Link>}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm text-slate-500">
            <span>{s.nom} · {s.role === "admin" ? "Admin" : "Collaborateur"}</span>
            <form action={deconnecter}><button className="text-slate-500 underline hover:text-slate-800">Déconnexion</button></form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1400px] px-4 py-6">{children}</main>
    </div>
  );
}
