-- CreateTable
CREATE TABLE "Cabinet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nom" TEXT NOT NULL,
    "pays" TEXT NOT NULL DEFAULT 'FR',
    "lienRdv" TEXT,
    "webhookUrl" TEXT,
    "webhookSecret" TEXT,
    "apiCleEntrante" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Utilisateur" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cabinetId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "motDePasseHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'collaborateur',
    "totpSecret" TEXT,
    "totpActif" BOOLEAN NOT NULL DEFAULT false,
    "tentativesEchouees" INTEGER NOT NULL DEFAULT 0,
    "verrouilleJusqua" DATETIME,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Utilisateur_cabinetId_fkey" FOREIGN KEY ("cabinetId") REFERENCES "Cabinet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Entite" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cabinetId" TEXT NOT NULL,
    "siren" TEXT,
    "raisonSociale" TEXT NOT NULL,
    "formeJuridique" TEXT,
    "codeNaf" TEXT,
    "activite" TEXT,
    "adresse" TEXT,
    "dateCreation" DATETIME,
    "capital" REAL,
    "caEstime" REAL,
    "effectif" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Entite_cabinetId_fkey" FOREIGN KEY ("cabinetId") REFERENCES "Cabinet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Personne" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cabinetId" TEXT NOT NULL,
    "entiteId" TEXT NOT NULL,
    "prenom" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'contact',
    "email" TEXT,
    "telephone" TEXT,
    "dateNaissance" DATETIME,
    "lieuNaissance" TEXT,
    "nationalite" TEXT,
    "pourcentageDetention" REAL,
    "estPPE" BOOLEAN NOT NULL DEFAULT false,
    "dateVerificationIdentite" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Personne_entiteId_fkey" FOREIGN KEY ("entiteId") REFERENCES "Entite" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Dossier" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cabinetId" TEXT NOT NULL,
    "entiteId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'nouveau',
    "source" TEXT,
    "besoin" TEXT,
    "typeMission" TEXT,
    "honorairesEstimes" REAL,
    "statut" TEXT NOT NULL DEFAULT 'lead',
    "motifRefus" TEXT,
    "responsableId" TEXT,
    "prochaineRelance" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Dossier_cabinetId_fkey" FOREIGN KEY ("cabinetId") REFERENCES "Cabinet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Dossier_entiteId_fkey" FOREIGN KEY ("entiteId") REFERENCES "Entite" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Dossier_responsableId_fkey" FOREIGN KEY ("responsableId") REFERENCES "Utilisateur" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Acceptation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dossierId" TEXT NOT NULL,
    "independanceOk" BOOLEAN NOT NULL DEFAULT false,
    "incompatibiliteAucune" BOOLEAN NOT NULL DEFAULT false,
    "competenceOk" BOOLEAN NOT NULL DEFAULT false,
    "moyensOk" BOOLEAN NOT NULL DEFAULT false,
    "confrerePrecedent" TEXT NOT NULL DEFAULT 'aucun',
    "confrereNom" TEXT,
    "confrereDateContact" DATETIME,
    "confrereReponse" TEXT,
    "commentaire" TEXT,
    "decision" TEXT NOT NULL DEFAULT 'en_attente',
    "valideLe" DATETIME,
    "valideParId" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Acceptation_dossierId_fkey" FOREIGN KEY ("dossierId") REFERENCES "Dossier" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Lcbft" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dossierId" TEXT NOT NULL,
    "criteres" TEXT NOT NULL DEFAULT '{}',
    "score" INTEGER NOT NULL DEFAULT 0,
    "niveau" TEXT NOT NULL DEFAULT 'standard',
    "niveauForce" BOOLEAN NOT NULL DEFAULT false,
    "justification" TEXT,
    "identiteVerifiee" BOOLEAN NOT NULL DEFAULT false,
    "beVerifies" BOOLEAN NOT NULL DEFAULT false,
    "gelVerifieLe" DATETIME,
    "gelResultat" TEXT,
    "valideLe" DATETIME,
    "valideParId" TEXT,
    "prochaineRevue" DATETIME,
    "finConservation" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Lcbft_dossierId_fkey" FOREIGN KEY ("dossierId") REFERENCES "Dossier" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Mission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dossierId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "perimetre" TEXT,
    "modeHonoraires" TEXT NOT NULL DEFAULT 'forfait',
    "montantHonoraires" REAL,
    "lmStatut" TEXT NOT NULL DEFAULT 'brouillon',
    "lmEnvoyeeLe" DATETIME,
    "lmSigneeLe" DATETIME,
    "idClientPennylane" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Mission_dossierId_fkey" FOREIGN KEY ("dossierId") REFERENCES "Dossier" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "JournalAudit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cabinetId" TEXT NOT NULL,
    "utilisateurId" TEXT,
    "utilisateurNom" TEXT,
    "action" TEXT NOT NULL,
    "objetType" TEXT NOT NULL,
    "objetId" TEXT,
    "avant" TEXT,
    "apres" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "JournalAudit_cabinetId_fkey" FOREIGN KEY ("cabinetId") REFERENCES "Cabinet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EvenementSortant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cabinetId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "statut" TEXT NOT NULL DEFAULT 'en_attente',
    "tentatives" INTEGER NOT NULL DEFAULT 0,
    "derniereErreur" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "envoyeLe" DATETIME,
    CONSTRAINT "EvenementSortant_cabinetId_fkey" FOREIGN KEY ("cabinetId") REFERENCES "Cabinet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Utilisateur_email_key" ON "Utilisateur"("email");

-- CreateIndex
CREATE INDEX "Entite_cabinetId_idx" ON "Entite"("cabinetId");

-- CreateIndex
CREATE INDEX "Personne_cabinetId_idx" ON "Personne"("cabinetId");

-- CreateIndex
CREATE INDEX "Dossier_cabinetId_statut_idx" ON "Dossier"("cabinetId", "statut");

-- CreateIndex
CREATE UNIQUE INDEX "Acceptation_dossierId_key" ON "Acceptation"("dossierId");

-- CreateIndex
CREATE UNIQUE INDEX "Lcbft_dossierId_key" ON "Lcbft"("dossierId");

-- CreateIndex
CREATE INDEX "JournalAudit_cabinetId_createdAt_idx" ON "JournalAudit"("cabinetId", "createdAt");

-- CreateIndex
CREATE INDEX "EvenementSortant_cabinetId_statut_idx" ON "EvenementSortant"("cabinetId", "statut");

-- Journal d'audit non modifiable : toute modification ou suppression est refusée.
CREATE TRIGGER "JournalAudit_interdire_modification"
BEFORE UPDATE ON "JournalAudit"
BEGIN
  SELECT RAISE(ABORT, 'Le journal d''audit ne peut pas être modifié');
END;

CREATE TRIGGER "JournalAudit_interdire_suppression"
BEFORE DELETE ON "JournalAudit"
BEGIN
  SELECT RAISE(ABORT, 'Le journal d''audit ne peut pas être supprimé');
END;
