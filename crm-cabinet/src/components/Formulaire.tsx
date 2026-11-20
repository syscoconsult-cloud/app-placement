"use client";
import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { formulaire, type ResultatFormulaire } from "@/app/(espace)/actions";

/** Formulaire relié à une action serveur, avec affichage des erreurs et confirmation. */
export function Formulaire({
  action,
  bouton,
  children,
  className = "space-y-4",
  boutonClasse = "btn",
  confirmer,
  vider = false,
}: {
  action: string;
  bouton: string;
  children?: React.ReactNode;
  className?: string;
  boutonClasse?: string;
  confirmer?: string;
  vider?: boolean;
}) {
  const [etat, envoyer, enCours] = useActionState<ResultatFormulaire, FormData>(
    formulaire.bind(null, action),
    undefined,
  );
  const ref = useRef<HTMLFormElement>(null);
  const [vu, setVu] = useState(false);
  useEffect(() => {
    if (etat?.ok) {
      setVu(true);
      if (vider) ref.current?.reset();
      const t = setTimeout(() => setVu(false), 2500);
      return () => clearTimeout(t);
    }
  }, [etat, vider]);

  return (
    <form
      ref={ref}
      className={className}
      onSubmit={(e) => {
        // Envoi manuel : évite la remise à zéro automatique du formulaire par React,
        // pour que les champs gardent les valeurs enregistrées.
        e.preventDefault();
        if (confirmer && !window.confirm(confirmer)) return;
        const donnees = new FormData(e.currentTarget);
        startTransition(() => envoyer(donnees));
      }}
    >
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <button className={boutonClasse} disabled={enCours}>{enCours ? "Patientez…" : bouton}</button>
        {vu && <span className="text-sm text-emerald-700">✓ Enregistré</span>}
        {etat?.erreur && <span className="text-sm text-red-700">{etat.erreur}</span>}
      </div>
    </form>
  );
}
