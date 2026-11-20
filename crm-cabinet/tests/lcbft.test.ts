import { describe, it, expect } from "vitest";
import { calculerRisque, dateProchaineRevue } from "@/lib/lcbft";

describe("score LCB-FT", () => {
  it("aucun critère : vigilance allégée", () => {
    expect(calculerRisque({})).toEqual({ score: 0, niveau: "faible" });
  });
  it("secteur sensible + espèces : vigilance standard", () => {
    expect(calculerRisque({ secteur_sensible: true, especes: true })).toEqual({ score: 6, niveau: "standard" });
  });
  it("cumul de critères : vigilance renforcée", () => {
    expect(calculerRisque({ secteur_sensible: true, especes: true, montage_complexe: true }).niveau).toBe("renforce");
  });
  it("une PPE impose toujours la vigilance renforcée", () => {
    expect(calculerRisque({ ppe: true }).niveau).toBe("renforce");
  });
  it("revue à 12 mois en vigilance renforcée", () => {
    const d = dateProchaineRevue("renforce", new Date("2026-01-15"));
    expect(d.toISOString().slice(0, 10)).toBe("2027-01-15");
  });
});
