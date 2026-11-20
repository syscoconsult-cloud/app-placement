"use client";
import { useActionState } from "react";
import type { EtatFormulaire } from "@/app/actions-auth";

export function FormulaireAuth({
  action,
  children,
  bouton,
}: {
  action: (e: EtatFormulaire, f: FormData) => Promise<EtatFormulaire>;
  children: React.ReactNode;
  bouton: string;
}) {
  const [etat, envoyer, enCours] = useActionState(action, undefined);
  return (
    <form action={envoyer} className="space-y-4">
      {children}
      {etat?.erreur && <p className="rounded-md bg-red-50 p-2 text-sm text-red-700">{etat.erreur}</p>}
      <button className="btn w-full justify-center" disabled={enCours}>
        {enCours ? "Patientez…" : bouton}
      </button>
    </form>
  );
}

export function CadreAuth({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="carte w-full max-w-sm">
        <h1 className="mb-1 text-lg font-semibold">CRM Cabinet</h1>
        <p className="mb-5 text-sm text-slate-500">{titre}</p>
        {children}
      </div>
    </main>
  );
}
