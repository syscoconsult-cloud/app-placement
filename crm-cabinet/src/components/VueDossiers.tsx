"use client";

// Vue des dossiers façon Airtable / Notion : tableau triable, filtrable, colonnes
// affichables/masquables, édition directe dans les cellules, regroupement, et vue Kanban.

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { STATUTS, TYPES_MISSION, SOURCES, couleurStatut, libelleMission } from "@/lib/constantes";
import { changerStatut, modifierChampDossier } from "@/app/(espace)/actions";

export type LigneDossier = {
  id: string;
  raisonSociale: string;
  siren: string | null;
  contact: string | null;
  email: string | null;
  statut: string;
  type: string;
  typeMission: string | null;
  source: string | null;
  honorairesEstimes: number | null;
  responsable: string | null;
  prochaineRelance: string | null; // AAAA-MM-JJ
  niveauLcbft: string | null;
  acceptationOk: boolean;
  lcbftOk: boolean;
  majLe: string;
};

type Colonne = { id: keyof LigneDossier | "conformite"; titre: string; defaut: boolean };
const COLONNES: Colonne[] = [
  { id: "statut", titre: "Statut", defaut: true },
  { id: "contact", titre: "Contact", defaut: true },
  { id: "typeMission", titre: "Mission", defaut: true },
  { id: "honorairesEstimes", titre: "Honoraires (€)", defaut: true },
  { id: "conformite", titre: "Conformité", defaut: true },
  { id: "prochaineRelance", titre: "Relance", defaut: true },
  { id: "source", titre: "Source", defaut: false },
  { id: "siren", titre: "SIREN / IFU", defaut: false },
  { id: "responsable", titre: "Responsable", defaut: false },
  { id: "type", titre: "Nouveau / renouv.", defaut: false },
  { id: "majLe", titre: "Modifié le", defaut: false },
];

const PREFS = "crm-vue-dossiers";
const euro = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });

export function VueDossiers({ lignes }: { lignes: LigneDossier[] }) {
  const [vue, setVue] = useState<"liste" | "kanban">("liste");
  const [recherche, setRecherche] = useState("");
  const [filtreStatut, setFiltreStatut] = useState<string>("actifs");
  const [tri, setTri] = useState<{ col: string; sens: 1 | -1 }>({ col: "majLe", sens: -1 });
  const [grouper, setGrouper] = useState(false);
  const [visibles, setVisibles] = useState<string[]>(COLONNES.filter((c) => c.defaut).map((c) => c.id));
  const [menuColonnes, setMenuColonnes] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [, demarrer] = useTransition();

  // Préférences d'affichage mémorisées sur ce navigateur
  useEffect(() => {
    try {
      const p = JSON.parse(localStorage.getItem(PREFS) || "{}");
      if (p.vue) setVue(p.vue);
      if (p.visibles) setVisibles(p.visibles);
      if (p.filtreStatut) setFiltreStatut(p.filtreStatut);
      if (typeof p.grouper === "boolean") setGrouper(p.grouper);
    } catch {}
  }, []);
  useEffect(() => {
    try { localStorage.setItem(PREFS, JSON.stringify({ vue, visibles, filtreStatut, grouper })); } catch {}
  }, [vue, visibles, filtreStatut, grouper]);

  const filtrees = useMemo(() => {
    const q = recherche.toLowerCase().trim();
    let r = lignes.filter((l) => {
      if (filtreStatut === "actifs" && (l.statut === "refuse" || l.statut === "client_actif")) return false;
      if (filtreStatut !== "tous" && filtreStatut !== "actifs" && l.statut !== filtreStatut) return false;
      if (!q) return true;
      return [l.raisonSociale, l.siren, l.contact, l.email, l.source].some((v) => v?.toLowerCase().includes(q));
    });
    const ordreStatut = (s: string) => STATUTS.findIndex((x) => x.id === s);
    r = [...r].sort((a, b) => {
      const va = tri.col === "statut" ? ordreStatut(a.statut) : (a as Record<string, unknown>)[tri.col];
      const vb = tri.col === "statut" ? ordreStatut(b.statut) : (b as Record<string, unknown>)[tri.col];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      return (va < vb ? -1 : va > vb ? 1 : 0) * tri.sens;
    });
    return r;
  }, [lignes, recherche, filtreStatut, tri]);

  const deplacer = (id: string, statut: string) => {
    let motif: string | undefined;
    if (statut === "refuse") {
      motif = window.prompt("Motif du refus :") ?? undefined;
      if (!motif) return;
    }
    demarrer(async () => {
      const r = await changerStatut(id, statut, motif);
      setMessage(r.ok ? null : r.raison ?? "Changement impossible.");
    });
  };
  const modifier = (id: string, champ: string, valeur: string) =>
    demarrer(async () => { await modifierChampDossier(id, champ, valeur); });

  const total = filtrees.reduce((t, l) => t + (l.honorairesEstimes ?? 0), 0);

  return (
    <div>
      {/* Barre d'outils */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-md border border-slate-300 bg-white p-0.5 text-sm">
          {(["liste", "kanban"] as const).map((v) => (
            <button key={v} onClick={() => setVue(v)}
              className={`rounded px-3 py-1.5 ${vue === v ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}>
              {v === "liste" ? "☰ Liste" : "▥ Kanban"}
            </button>
          ))}
        </div>
        <input value={recherche} onChange={(e) => setRecherche(e.target.value)}
          placeholder="Rechercher (nom, SIREN, contact…)" className="champ w-64" />
        <select value={filtreStatut} onChange={(e) => setFiltreStatut(e.target.value)} className="champ w-56">
          <option value="actifs">En cours (hors clients actifs et refusés)</option>
          <option value="tous">Tous les dossiers</option>
          {STATUTS.map((s) => <option key={s.id} value={s.id}>{s.libelle}</option>)}
        </select>
        {vue === "liste" && (
          <>
            <label className="flex items-center gap-1.5 text-sm text-slate-600">
              <input type="checkbox" checked={grouper} onChange={(e) => setGrouper(e.target.checked)} /> Grouper par statut
            </label>
            <div className="relative">
              <button className="btn-sec" onClick={() => setMenuColonnes(!menuColonnes)}>Colonnes ▾</button>
              {menuColonnes && (
                <div className="absolute z-10 mt-1 w-56 rounded-md border border-slate-200 bg-white p-2 shadow-lg">
                  {COLONNES.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-slate-50">
                      <input type="checkbox" checked={visibles.includes(c.id)}
                        onChange={(e) => setVisibles(e.target.checked ? [...visibles, c.id] : visibles.filter((v) => v !== c.id))} />
                      {c.titre}
                    </label>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
        <Link href="/dossiers/nouveau" className="btn ml-auto">+ Nouveau dossier</Link>
      </div>

      {message && (
        <div className="mb-3 flex items-center justify-between rounded-md bg-amber-50 p-3 text-sm text-amber-900">
          <span>⚠ {message}</span>
          <button onClick={() => setMessage(null)} className="text-amber-700">✕</button>
        </div>
      )}

      {vue === "liste" ? (
        <Tableau lignes={filtrees} visibles={visibles} tri={tri} setTri={setTri} grouper={grouper}
          deplacer={deplacer} modifier={modifier} />
      ) : (
        <Kanban lignes={filtrees} filtreStatut={filtreStatut} deplacer={deplacer} />
      )}

      <p className="mt-3 text-xs text-slate-500">
        {filtrees.length} dossier{filtrees.length > 1 ? "s" : ""} · honoraires estimés : {euro.format(total)} €
      </p>
    </div>
  );
}

function Tableau({ lignes, visibles, tri, setTri, grouper, deplacer, modifier }: {
  lignes: LigneDossier[];
  visibles: string[];
  tri: { col: string; sens: 1 | -1 };
  setTri: (t: { col: string; sens: 1 | -1 }) => void;
  grouper: boolean;
  deplacer: (id: string, s: string) => void;
  modifier: (id: string, champ: string, v: string) => void;
}) {
  const cols = COLONNES.filter((c) => visibles.includes(c.id));
  const enTete = (id: string, titre: string) => (
    <th key={id} onClick={() => setTri({ col: id, sens: tri.col === id ? (tri.sens === 1 ? -1 : 1) : 1 })}
      className="cursor-pointer select-none whitespace-nowrap border-b border-slate-200 px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate-500 hover:text-slate-800">
      {titre} {tri.col === id ? (tri.sens === 1 ? "↑" : "↓") : ""}
    </th>
  );
  const groupes = grouper
    ? STATUTS.map((s) => ({ titre: s.libelle, lignes: lignes.filter((l) => l.statut === s.id) })).filter((g) => g.lignes.length)
    : [{ titre: "", lignes }];

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full min-w-[900px] text-sm">
        <thead className="bg-slate-50">
          <tr>{enTete("raisonSociale", "Entité")}{cols.map((c) => enTete(c.id, c.titre))}</tr>
        </thead>
        <tbody>
          {groupes.map((g) => (
            <GroupeLignes key={g.titre || "tout"} titre={g.titre} nbCols={cols.length + 1}>
              {g.lignes.map((l) => (
                <tr key={l.id} className="border-b border-slate-100 hover:bg-indigo-50/40">
                  <td className="px-3 py-2 font-medium">
                    <Link href={`/dossiers/${l.id}`} className="text-indigo-700 hover:underline">{l.raisonSociale}</Link>
                  </td>
                  {cols.map((c) => (
                    <td key={c.id} className="whitespace-nowrap px-3 py-1.5">
                      <Cellule ligne={l} col={c.id} deplacer={deplacer} modifier={modifier} />
                    </td>
                  ))}
                </tr>
              ))}
            </GroupeLignes>
          ))}
          {lignes.length === 0 && (
            <tr><td colSpan={cols.length + 1} className="px-3 py-10 text-center text-slate-400">Aucun dossier.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function GroupeLignes({ titre, nbCols, children }: { titre: string; nbCols: number; children: React.ReactNode }) {
  return (
    <>
      {titre && (
        <tr className="bg-slate-50/70">
          <td colSpan={nbCols} className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">{titre}</td>
        </tr>
      )}
      {children}
    </>
  );
}

function Cellule({ ligne: l, col, deplacer, modifier }: {
  ligne: LigneDossier; col: string;
  deplacer: (id: string, s: string) => void;
  modifier: (id: string, champ: string, v: string) => void;
}) {
  const sansBord = "rounded border border-transparent bg-transparent px-1 py-0.5 hover:border-slate-300 focus:border-indigo-400 focus:outline-none";
  switch (col) {
    case "statut":
      return (
        <select value={l.statut} onChange={(e) => deplacer(l.id, e.target.value)}
          className={`pastille cursor-pointer border-0 ${couleurStatut(l.statut)}`}>
          {STATUTS.map((s) => <option key={s.id} value={s.id}>{s.libelle}</option>)}
        </select>
      );
    case "typeMission":
      return (
        <select defaultValue={l.typeMission ?? ""} onChange={(e) => modifier(l.id, "typeMission", e.target.value)} className={sansBord}>
          <option value="">—</option>
          {TYPES_MISSION.map((t) => <option key={t.id} value={t.id}>{t.libelle}</option>)}
        </select>
      );
    case "source":
      return (
        <select defaultValue={l.source ?? ""} onChange={(e) => modifier(l.id, "source", e.target.value)} className={sansBord}>
          <option value="">—</option>
          {SOURCES.map((s) => <option key={s}>{s}</option>)}
        </select>
      );
    case "honorairesEstimes":
      return (
        <input defaultValue={l.honorairesEstimes ?? ""} inputMode="decimal" className={`${sansBord} w-24 text-right`}
          onBlur={(e) => e.target.value !== String(l.honorairesEstimes ?? "") && modifier(l.id, "honorairesEstimes", e.target.value)} />
      );
    case "prochaineRelance": {
      const enRetard = l.prochaineRelance && l.prochaineRelance < new Date().toISOString().slice(0, 10);
      return (
        <input type="date" defaultValue={l.prochaineRelance ?? ""} className={`${sansBord} ${enRetard ? "text-red-600" : ""}`}
          onChange={(e) => modifier(l.id, "prochaineRelance", e.target.value)} />
      );
    }
    case "conformite":
      return (
        <span className="flex gap-1">
          <span title="Acceptation de la mission" className={`pastille ${l.acceptationOk ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
            {l.acceptationOk ? "✓" : "○"} Accept.
          </span>
          <span title="Dossier LCB-FT" className={`pastille ${l.lcbftOk ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
            {l.lcbftOk ? "✓" : "○"} LCB-FT{l.niveauLcbft === "renforce" ? " ⚠" : ""}
          </span>
        </span>
      );
    case "type":
      return <span>{l.type === "renouvellement" ? "Renouvellement" : "Nouveau"}</span>;
    case "majLe":
      return <span className="text-slate-500">{new Date(l.majLe).toLocaleDateString("fr-FR")}</span>;
    case "contact":
      return <span>{l.contact ?? "—"}{l.email && <span className="ml-1 text-slate-400">· {l.email}</span>}</span>;
    default:
      return <span>{String((l as Record<string, unknown>)[col] ?? "—")}</span>;
  }
}

function Kanban({ lignes, filtreStatut, deplacer }: {
  lignes: LigneDossier[]; filtreStatut: string; deplacer: (id: string, s: string) => void;
}) {
  const [survol, setSurvol] = useState<string | null>(null);
  const colonnes = STATUTS.filter((s) =>
    filtreStatut === "actifs" ? s.id !== "refuse" && s.id !== "client_actif"
      : filtreStatut === "tous" ? true : s.id === filtreStatut);
  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {colonnes.map((s) => {
        const cartes = lignes.filter((l) => l.statut === s.id);
        return (
          <div key={s.id}
            onDragOver={(e) => { e.preventDefault(); setSurvol(s.id); }}
            onDragLeave={() => setSurvol(null)}
            onDrop={(e) => { e.preventDefault(); setSurvol(null); deplacer(e.dataTransfer.getData("text/plain"), s.id); }}
            className={`w-64 shrink-0 rounded-lg p-2 ${survol === s.id ? "bg-indigo-100" : "bg-slate-100"}`}>
            <div className="mb-2 flex items-center justify-between px-1">
              <span className={`pastille ${s.couleur}`}>{s.libelle}</span>
              <span className="text-xs text-slate-500">{cartes.length}</span>
            </div>
            <div className="space-y-2">
              {cartes.map((l) => (
                <Link key={l.id} href={`/dossiers/${l.id}`} draggable
                  onDragStart={(e) => e.dataTransfer.setData("text/plain", l.id)}
                  className="block rounded-md border border-slate-200 bg-white p-3 text-sm shadow-sm hover:border-indigo-300">
                  <div className="font-medium">{l.raisonSociale}</div>
                  <div className="mt-0.5 text-xs text-slate-500">{libelleMission(l.typeMission)}</div>
                  <div className="mt-2 flex items-center justify-between text-xs">
                    <span className="text-slate-600">{l.honorairesEstimes ? `${euro.format(l.honorairesEstimes)} €` : ""}</span>
                    <span className="flex gap-1">
                      <span className={l.acceptationOk ? "text-emerald-600" : "text-slate-300"} title="Acceptation">●</span>
                      <span className={l.lcbftOk ? "text-emerald-600" : "text-slate-300"} title="LCB-FT">●</span>
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

