/* ----- France : calendrier DGFiP, URSSAF (DSN) et greffe ----- */
const IMPOTS = "https://www.impots.gouv.fr/professionnel", NET = "https://www.net-entreprises.fr", GREFFE = "https://www.infogreffe.fr";
const FERIES_FIXES = [[1,1],[5,1],[5,8],[7,14],[8,15],[11,1],[11,11],[12,25]]; // + lundi de Pâques, Ascension, lundi de Pentecôte
const REF = {
  "FR-TVA-M":       {lib:"TVA — CA3 mensuelle", cat:"Fiscale", portail:IMPOTS},
  "FR-TVA-T":       {lib:"TVA — CA3 trimestrielle", cat:"Fiscale", portail:IMPOTS},
  "FR-TVA-CA12-AC": {lib:"TVA — acompte CA12", cat:"Fiscale", portail:IMPOTS},
  "FR-TVA-CA12":    {lib:"TVA — déclaration annuelle CA12", cat:"Fiscale", portail:IMPOTS},
  "FR-IS-AC":       {lib:"IS — acompte (2571)", cat:"Fiscale", portail:IMPOTS},
  "FR-IS-SOLDE":    {lib:"IS — relevé de solde (2572)", cat:"Fiscale", portail:IMPOTS},
  "FR-LIASSE":      {lib:"Dépôt de la liasse fiscale", cat:"Fiscale", portail:IMPOTS},
  "FR-DAS2":        {lib:"DAS2 — honoraires versés", cat:"Fiscale", portail:IMPOTS},
  "FR-CFE-AC":      {lib:"CFE — acompte", cat:"Fiscale", portail:IMPOTS},
  "FR-CFE":         {lib:"CFE — solde", cat:"Fiscale", portail:IMPOTS},
  "FR-CVAE-AC":     {lib:"CVAE — acompte (1329-AC)", cat:"Fiscale", portail:IMPOTS},
  "FR-CVAE":        {lib:"CVAE — déclaration 1330 et solde 1329-DEF", cat:"Fiscale", portail:IMPOTS},
  "FR-DSN":         {lib:"DSN mensuelle", cat:"Sociale", portail:NET},
  "FR-CPTES":       {lib:"Comptes annuels — révision et production du bilan", cat:"Comptable", portail:null},
  "FR-AG":          {lib:"AGO d'approbation des comptes", cat:"Juridique", portail:null},
  "FR-DEPOT":       {lib:"Dépôt des comptes au greffe", cat:"Juridique", portail:GREFFE},
};
const PAYS = {
  cle: "echeances-france", titre: "Échéances France", drapeau: "🇫🇷", monnaie: "€", pennylane: true,
  dossier_conseille: "ECHEANCES FISCALES FRANCE",
  formulaire: {formes: ["SAS","SASU","SARL","EURL","SCI","EI","SA","SNC","Association"], identifiant: "SIREN",
    regimes_imposition: ["IS","IR"], regimes_tva: ["Mensuel (CA3)","Trimestriel (CA3)","Simplifié (CA12)","Franchise en base"], jour_tva_defaut: 19, jour_tva_modifiable: true,
    cases: [["salaries","Salariés"],["cfe","CFE"],["acompte_cfe","Acompte CFE (CFE N-1 ≥ 3 000 €)"],["cvae","CVAE"],["depot_comptes","Dépôt des comptes au greffe"]]},
  libelle_liasse: "Liasse fiscale", code_liasse: "FR-LIASSE", code_ag: "FR-AG", code_depot: "FR-DEPOT",
  /* Rattachement d'une déclaration Pennylane à l'échéance correspondante. */
  correspond(e, r){
    const [y, m] = r.periode_fin.split("-").map(Number), ex = `exercice clos le ${dfr(r.periode_fin)}`;
    if (r.type === "LIASSE") return e.code === "FR-LIASSE" && e.periode === ex;
    if (r.type === "TVA") return (e.code === "FR-TVA-M" && e.periode === `${MOIS[m-1]} ${y}`)
      || (e.code === "FR-TVA-T" && m % 3 === 0 && e.periode === `T${m/3} ${y}`) || (e.code === "FR-TVA-CA12" && e.periode === ex);
    return false;
  },
  regles: [["TVA CA3 mensuelle ou trimestrielle","jour limite du dossier (15 au 24 selon le SIE) du mois suivant la période"],
     ["TVA CA12","acomptes en juillet et décembre ; déclaration annuelle le 2e jour ouvré suivant le 1er mai (clôture au 31/12), sinon 3 mois après la clôture"],
     ["IS — acomptes","15 du 3e, 6e, 9e et 12e mois de l'exercice"],["IS — solde","15 mai (clôture au 31/12), sinon le 15 du 4e mois après la clôture"],
     ["Liasse fiscale et DAS2","2e jour ouvré suivant le 1er mai + 15 jours (clôture au 31/12), sinon 3 mois après la clôture + 15 jours"],
     ["CFE","acompte le 15 juin si demandé, solde le 15 décembre"],["CVAE","acomptes les 15 juin et 15 septembre, solde le 2e jour ouvré suivant le 1er mai"],
     ["DSN","5 du mois suivant (50 salariés et plus) ou 15 du mois suivant"],["Comptes annuels","objectif cabinet : 3 mois après la clôture"],
     ["AGO","6 mois après la clôture"],["Dépôt des comptes au greffe","objectif : 7 mois après la clôture"]],
  note_regles: "Dates reportées au jour ouvré suivant (week-ends et jours fériés). TVA, liasse et lettres de mission mises à jour chaque nuit depuis Pennylane. À relire après chaque loi de finances.",
};
function deuxiemeJourOuvreApres1erMai(a){ let d = D(a,5,1), n = 0;
  while (n < 2) { d = plusJours(d, 1); if (![0,6].includes(d.getUTCDay()) && !feries(a).has(iso(d))) n++; } return d; }

/* Échéances d'un dossier entre du et au (dates UTC). */
function generer(dos, du, au){
  const out = new Map();
  const ajout = (code, brute, periode) => { const d = jourOuvre(brute);
    if (d >= du && d <= au) out.set(code+"|"+periode, {code, date_limite: iso(d), periode}); };
  const regime = dos.regime_imposition, tva = dos.regime_tva, eff = Number(dos.effectif)||0, jt = Number(dos.jour_tva)||19;
  const societe = dos.forme && dos.forme !== "EI";
  const jour = (y, m, j) => D(y, m, Math.min(j, finMois(y,m).getUTCDate()));
  let a = ajouterMois(du, -3).getUTCFullYear(), m = ajouterMois(du, -3).getUTCMonth()+1;
  while (a < au.getUTCFullYear() || (a === au.getUTCFullYear() && m <= au.getUTCMonth()+1)) {
    const s = ajouterMois(D(a,m,1), 1), sy = s.getUTCFullYear(), sm = s.getUTCMonth()+1, per = `${MOIS[m-1]} ${a}`;
    if (tva === "Mensuel (CA3)") ajout("FR-TVA-M", jour(sy, sm, jt), per);
    if (tva === "Trimestriel (CA3)" && m % 3 === 0) ajout("FR-TVA-T", jour(sy, sm, jt), `T${m/3} ${a}`);
    if (tva === "Simplifié (CA12)" && (m === 7 || m === 12)) ajout("FR-TVA-CA12-AC", jour(a, m, jt), `acompte ${MOIS[m-1]} ${a}`);
    if (dos.salaries) ajout("FR-DSN", D(sy, sm, eff >= 50 ? 5 : 15), per);
    if (dos.cfe) { if (m === 6 && dos.acompte_cfe) ajout("FR-CFE-AC", D(a,6,15), String(a)); if (m === 12) ajout("FR-CFE", D(a,12,15), String(a)); }
    if (dos.cvae && (m === 6 || m === 9)) ajout("FR-CVAE-AC", D(a,m,15), `acompte ${MOIS[m-1]} ${a}`);
    if (dos.cvae && m === 5) ajout("FR-CVAE", deuxiemeJourOuvreApres1erMai(a), `CVAE ${a-1}`);
    if (++m > 12) { m = 1; a++; }
  }
  const c0 = deIso(dos.cloture || `${du.getUTCFullYear()}-12-31`);
  const finM = iso(c0) === iso(finDeMois(c0));
  for (const k of [-1,0,1]) {
    let c = ajouterMois(c0, 12*k); if (finM) c = finDeMois(c);
    const ex = `exercice clos le ${iso(c).split("-").reverse().join("/")}`, cal = c.getUTCMonth() === 11 && c.getUTCDate() === 31;
    const liasse = plusJours(cal ? deuxiemeJourOuvreApres1erMai(c.getUTCFullYear()+1) : finDeMois(ajouterMois(c,3)), 15);
    ajout("FR-LIASSE", liasse, ex); ajout("FR-DAS2", liasse, ex);
    if (regime === "IS") {
      const debut = plusJours(c, -364);
      for (const k2 of [2,5,8,11]) { const ma = ajouterMois(D(debut.getUTCFullYear(), debut.getUTCMonth()+1, 1), k2);
        ajout("FR-IS-AC", D(ma.getUTCFullYear(), ma.getUTCMonth()+1, 15), `acompte ${MOIS[ma.getUTCMonth()]} ${ma.getUTCFullYear()}`); }
      const s4 = ajouterMois(c, 4);
      ajout("FR-IS-SOLDE", cal ? D(c.getUTCFullYear()+1,5,15) : jour(s4.getUTCFullYear(), s4.getUTCMonth()+1, 15), ex);
    }
    if (tva === "Simplifié (CA12)") ajout("FR-TVA-CA12", cal ? deuxiemeJourOuvreApres1erMai(c.getUTCFullYear()+1) : finDeMois(ajouterMois(c,3)), ex);
    ajout("FR-CPTES", finDeMois(ajouterMois(c,3)), ex);
    if (societe) ajout("FR-AG", finDeMois(ajouterMois(c,6)), ex);
    if (dos.depot_comptes) ajout("FR-DEPOT", finDeMois(ajouterMois(c,7)), ex);
  }
  return [...out.values()].sort((x,y)=> x.date_limite.localeCompare(y.date_limite) || x.code.localeCompare(y.code));
}
