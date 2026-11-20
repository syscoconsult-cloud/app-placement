"use client";
import { useState, useTransition } from "react";
import { STATUTS } from "@/lib/constantes";
import { changerStatut } from "@/app/(espace)/actions";

export function ChangerStatut({ dossierId, statut }: { dossierId: string; statut: string }) {
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();
  const idx = STATUTS.findIndex((s) => s.id === statut);
  return (
    <div>
      <ol className="flex flex-wrap gap-1">
        {STATUTS.filter((s) => s.id !== "refuse").map((s, i) => (
          <li key={s.id}>
            <button
              disabled={enCours}
              onClick={() => demarrer(async () => {
                const r = await changerStatut(dossierId, s.id);
                setErreur(r.ok ? null : r.raison ?? null);
              })}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                s.id === statut ? "bg-indigo-600 text-white"
                  : statut !== "refuse" && i < idx ? "bg-indigo-100 text-indigo-700"
                  : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
              {i + 1}. {s.libelle}
            </button>
          </li>
        ))}
        <li>
          <button
            disabled={enCours}
            onClick={() => {
              const motif = window.prompt("Motif du refus (sera conservé dans le dossier) :");
              if (motif) demarrer(async () => {
                const r = await changerStatut(dossierId, "refuse", motif);
                setErreur(r.ok ? null : r.raison ?? null);
              });
            }}
            className={`rounded-full px-3 py-1 text-xs font-medium ${statut === "refuse" ? "bg-red-600 text-white" : "bg-red-50 text-red-600 hover:bg-red-100"}`}>
            Refusé
          </button>
        </li>
      </ol>
      {erreur && <p className="mt-2 rounded-md bg-amber-50 p-2 text-sm text-amber-900">⚠ {erreur}</p>}
    </div>
  );
}
