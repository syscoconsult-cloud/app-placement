import { describe, it, expect } from "vitest";
import { verifierTransition } from "@/lib/pipeline";

const base = { statut: "lcbft", acceptationValidee: false, lcbftValide: false };

describe("règles du pipeline", () => {
  it("bloque la lettre de mission sans acceptation validée", () => {
    const r = verifierTransition(base, "lm_envoyee");
    expect(r.ok).toBe(false);
  });
  it("bloque la lettre de mission sans LCB-FT validé", () => {
    const r = verifierTransition({ ...base, acceptationValidee: true }, "lm_envoyee");
    expect(r).toMatchObject({ ok: false });
  });
  it("bloque aussi un saut direct vers « client actif »", () => {
    expect(verifierTransition({ ...base, statut: "lead" }, "client_actif").ok).toBe(false);
  });
  it("autorise la lettre de mission quand tout est validé", () => {
    expect(verifierTransition({ ...base, acceptationValidee: true, lcbftValide: true }, "lm_envoyee").ok).toBe(true);
  });
  it("autorise les étapes amont librement", () => {
    expect(verifierTransition({ ...base, statut: "lead" }, "acceptation").ok).toBe(true);
  });
  it("exige un motif de refus", () => {
    expect(verifierTransition(base, "refuse").ok).toBe(false);
    expect(verifierTransition(base, "refuse", "  ").ok).toBe(false);
    expect(verifierTransition(base, "refuse", "Hors périmètre").ok).toBe(true);
  });
  it("rejette un statut inconnu", () => {
    expect(verifierTransition(base, "n_importe_quoi").ok).toBe(false);
  });
});
