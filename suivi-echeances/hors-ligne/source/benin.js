/* ----- Bénin : calendrier DGI, CNSS et OHADA ----- */
const DGI = "https://eservices.impots.bj", CNSS = "https://www.cnss.bj";
const FERIES_FIXES = [[1,1],[1,10],[5,1],[8,1],[8,15],[11,1],[12,25]]; // + lundi de Pâques, Ascension, lundi de Pentecôte
const REF = {
  "BJ-TVA":        {lib:"TVA — déclaration mensuelle", cat:"Fiscale", portail:DGI},
  "BJ-ITS":        {lib:"ITS et VPS — retenues sur salaires", cat:"Fiscale", portail:DGI},
  "BJ-AIB":        {lib:"AIB — reversement des retenues", cat:"Fiscale", portail:DGI},
  "BJ-IRF-RET":    {lib:"IRF — reversement des retenues sur loyers versés", cat:"Fiscale", portail:DGI},
  "BJ-CNSS":       {lib:"CNSS — déclaration et paiement des cotisations", cat:"Sociale", portail:CNSS},
  "BJ-IS-AC":      {lib:"IS — acomptes", cat:"Fiscale", portail:DGI},
  "BJ-PATENTE-AC": {lib:"Patente — acompte (50 % de la patente N-1)", cat:"Fiscale", portail:DGI},
  "BJ-PATENTE":    {lib:"Patente — solde", cat:"Fiscale", portail:DGI},
  "BJ-IRF":        {lib:"IRF — déclaration annuelle des revenus fonciers (date à confirmer)", cat:"Fiscale", portail:DGI},
  "BJ-DSF":        {lib:"Dépôt de la liasse fiscale (DSF) et solde IS", cat:"Fiscale", portail:DGI},
  "BJ-CPTES":      {lib:"États financiers SYSCOHADA — révision et production", cat:"Comptable", portail:null},
  "BJ-AG":         {lib:"AGO d'approbation des comptes (OHADA)", cat:"Juridique", portail:null},
  "BJ-RCCM":       {lib:"Dépôt des états financiers au RCCM", cat:"Juridique", portail:null},
};
const PAYS = {
  cle: "echeances-benin", titre: "Échéances Bénin", drapeau: "🇧🇯", monnaie: "FCFA", pennylane: false,
  dossier_conseille: "ECHEANCES FISCALES BENIN",
  formulaire: {formes: ["SARL","SARLU","SA","SAS","SASU","SNC","GIE","EI","Association"], identifiant: "IFU",
    regimes_imposition: ["IS"], regimes_tva: ["Mensuel (Bénin)","Non assujetti"], jour_tva_defaut: 10, jour_tva_modifiable: false,
    cases: [["salaries","Salariés"],["depot_comptes","Dépôt des états financiers au RCCM"],["irf_retenue","Paie un loyer (retenue IRF à reverser)"],["irf_proprietaire","Perçoit des loyers (IRF propriétaire)"]]},
  libelle_liasse: "Liasse (DSF)", code_liasse: "BJ-DSF", code_ag: "BJ-AG", code_depot: "BJ-RCCM",
  correspond: () => false,
  regles: [["TVA (assujettis)","10 du mois suivant"],["ITS et VPS (salariés)","10 du mois suivant"],["AIB","10 du mois suivant"],["IRF — retenue sur loyers versés","10 du mois suivant"],
     ["CNSS","15 du mois suivant si effectif ≥ 20, sinon trimestriel (15 du mois suivant le trimestre)"],["IS — acomptes","10 mars, 10 juin, 10 septembre, 10 décembre"],
     ["Patente","acompte le 10 février, solde le 30 avril"],["Liasse fiscale (DSF) et solde IS","30 avril"],["IRF — propriétaire","30 avril (à confirmer)"],
     ["États financiers SYSCOHADA","objectif cabinet : 3 mois après la clôture"],["AGO (OHADA)","6 mois après la clôture"],["Dépôt au RCCM","7 mois après la clôture (à confirmer)"]],
  note_regles: "Dates reportées au jour ouvré suivant (week-ends, fêtes fixes et chrétiennes ; les fêtes musulmanes ne sont pas prises en compte). À relire après chaque loi de finances.",
};

/* Échéances d'un dossier entre du et au (dates UTC). */
function generer(dos, du, au){
  const out = new Map();
  const ajout = (code, brute, periode) => { const d = jourOuvre(brute);
    if (d >= du && d <= au) out.set(code+"|"+periode, {code, date_limite: iso(d), periode}); };
  const regime = dos.regime_imposition || "IS", tva = dos.regime_tva, eff = Number(dos.effectif)||0;
  const societe = dos.forme && dos.forme !== "EI";
  let a = ajouterMois(du, -3).getUTCFullYear(), m = ajouterMois(du, -3).getUTCMonth()+1;
  while (a < au.getUTCFullYear() || (a === au.getUTCFullYear() && m <= au.getUTCMonth()+1)) {
    const s = ajouterMois(D(a,m,1), 1), sy = s.getUTCFullYear(), sm = s.getUTCMonth()+1, per = `${MOIS[m-1]} ${a}`;
    if (tva === "Mensuel (Bénin)") ajout("BJ-TVA", D(sy, sm, Math.min(Number(dos.jour_tva)||10, finMois(sy,sm).getUTCDate())), per);
    if (dos.salaries) {
      ajout("BJ-ITS", D(sy,sm,10), per);
      if (eff >= 20) ajout("BJ-CNSS", D(sy,sm,15), per);
      else if (m % 3 === 0) ajout("BJ-CNSS", D(sy,sm,15), `T${m/3} ${a}`);
    }
    ajout("BJ-AIB", D(sy,sm,10), per);
    if (dos.irf_retenue) ajout("BJ-IRF-RET", D(sy,sm,10), per);
    if (regime === "IS") {
      if (m % 3 === 0) ajout("BJ-IS-AC", D(a,m,10), `acompte ${MOIS[m-1]} ${a}`);
      if (m === 2) ajout("BJ-PATENTE-AC", D(a,2,10), String(a));
      if (m === 4) ajout("BJ-PATENTE", D(a,4,30), String(a));
    }
    if (dos.irf_proprietaire && m === 4) ajout("BJ-IRF", D(a,4,30), `revenus ${a-1}`);
    if (++m > 12) { m = 1; a++; }
  }
  const c0 = deIso(dos.cloture || `${du.getUTCFullYear()}-12-31`);
  const finM = iso(c0) === iso(finDeMois(c0));
  for (const k of [-1,0,1]) {
    let c = ajouterMois(c0, 12*k); if (finM) c = finDeMois(c);
    const ex = `exercice clos le ${iso(c).split("-").reverse().join("/")}`;
    if (regime === "IS") ajout("BJ-DSF", D(c.getUTCFullYear()+1,4,30), ex);
    ajout("BJ-CPTES", finDeMois(ajouterMois(c,3)), ex);
    if (societe) ajout("BJ-AG", finDeMois(ajouterMois(c,6)), ex);
    if (dos.depot_comptes) ajout("BJ-RCCM", finDeMois(ajouterMois(c,7)), ex);
  }
  return [...out.values()].sort((x,y)=> x.date_limite.localeCompare(y.date_limite) || x.code.localeCompare(y.code));
}
