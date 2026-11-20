// Données fictives de démonstration. Lancement : npm run db:seed
// N'utilisez jamais de vraies données clients pendant les essais.
import { PrismaClient } from "@prisma/client";
import { hash } from "@node-rs/argon2";

const db = new PrismaClient();

const EXEMPLES = [
  { rs: "Boulangerie des Lilas", fj: "SARL", act: "Boulangerie-pâtisserie", mission: "tenue", hon: 3600, statut: "lead", contact: ["Claire", "Martin"] },
  { rs: "Studio Nova", fj: "SAS", act: "Agence de design graphique", mission: "tenue", hon: 4200, statut: "acceptation", contact: ["Hugo", "Bernard"] },
  { rs: "BTP Rénov 33", fj: "SAS", act: "Travaux de rénovation", mission: "revision", hon: 9800, statut: "lcbft", contact: ["Karim", "Haddad"], risque: ["secteur_sensible", "especes"] },
  { rs: "Clinique Vétérinaire du Parc", fj: "SELARL", act: "Soins vétérinaires", mission: "social", hon: 7200, statut: "lm_envoyee", contact: ["Inès", "Lefèvre"], valide: true },
  { rs: "Les Jardins de Léa", fj: "EURL", act: "Paysagiste", mission: "tenue", hon: 2900, statut: "signee", contact: ["Léa", "Robert"], valide: true },
  { rs: "Cotonou Import Export", fj: "SARL", act: "Négoce international", mission: "conseil", hon: 6500, statut: "acceptation", contact: ["Adjoa", "Hounkpatin"], risque: ["pays_risque"] },
  { rs: "Holding Familiale Dupuis", fj: "SC", act: "Holding", mission: "juridique", hon: 1800, statut: "client_actif", contact: ["Marc", "Dupuis"], valide: true, type: "renouvellement" },
  { rs: "Food Truck Saveurs", fj: "EI", act: "Restauration ambulante", mission: "creation", hon: 1200, statut: "lead", contact: ["Sami", "Benali"] },
  { rs: "Pixel Conseil", fj: "SASU", act: "Conseil informatique", mission: "tenue", hon: 2400, statut: "onboarding", contact: ["Julie", "Moreau"], valide: true },
  { rs: "Immo Prestige Riviera", fj: "SAS", act: "Agence immobilière", mission: "revision", hon: 11000, statut: "refuse", contact: ["Victor", "Lambert"], risque: ["secteur_sensible", "montage_complexe", "be_non_identifie"], motif: "Bénéficiaire effectif non identifiable" },
];

async function main() {
  let cabinet = await db.cabinet.findFirst();
  let admin = cabinet ? await db.utilisateur.findFirst({ where: { cabinetId: cabinet.id, role: "admin" } }) : null;
  if (!cabinet) {
    cabinet = await db.cabinet.create({ data: { nom: "Cabinet Démo", pays: "FR", lienRdv: "https://calendly.com/exemple/onboarding" } });
    admin = await db.utilisateur.create({
      data: { cabinetId: cabinet.id, nom: "Admin Démo", email: "demo@exemple.fr", role: "admin", motDePasseHash: await hash("demonstration-crm") },
    });
    console.log("Compte de démonstration : demo@exemple.fr / demonstration-crm (la 2FA sera demandée à la 1re connexion)");
  }
  const jours = (n: number) => new Date(Date.now() + n * 86_400_000);

  for (const [i, e] of EXEMPLES.entries()) {
    const entite = await db.entite.create({
      data: {
        cabinetId: cabinet.id, raisonSociale: e.rs, formeJuridique: e.fj, activite: e.act,
        siren: String(900000000 + i * 1111), adresse: `${10 + i} rue de l'Exemple, 33000 Bordeaux`,
        personnes: { create: [{
          cabinetId: cabinet.id, prenom: e.contact[0], nom: e.contact[1], role: "dirigeant",
          email: `${e.contact[0].toLowerCase()}@exemple.fr`, pourcentageDetention: 100,
        }] },
      },
    });
    const criteres = Object.fromEntries((e.risque ?? []).map((r) => [r, true]));
    await db.dossier.create({
      data: {
        cabinetId: cabinet.id, entiteId: entite.id, statut: e.statut, typeMission: e.mission,
        honorairesEstimes: e.hon, source: ["Recommandation", "Site internet", "Réseaux sociaux"][i % 3],
        type: e.type ?? "nouveau", besoin: "Accompagnement comptable et fiscal annuel.", motifRefus: e.motif,
        responsableId: admin?.id, prochaineRelance: e.statut === "client_actif" ? null : jours((i % 5) * 3 - 3),
        acceptation: { create: e.valide
          ? { independanceOk: true, incompatibiliteAucune: true, competenceOk: true, moyensOk: true, decision: "acceptee", valideLe: jours(-10), valideParId: admin?.id }
          : {} },
        lcbft: { create: e.valide
          ? { identiteVerifiee: true, beVerifies: true, gelVerifieLe: jours(-10), gelResultat: "aucune_correspondance", score: 0, niveau: "faible", valideLe: jours(-9), valideParId: admin?.id, prochaineRevue: jours(3 * 365) }
          : { criteres: JSON.stringify(criteres) } },
      },
    });
  }
  console.log(`${EXEMPLES.length} dossiers fictifs créés.`);
}

main().finally(() => db.$disconnect());
