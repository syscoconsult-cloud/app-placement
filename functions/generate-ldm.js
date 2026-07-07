/**
 * functions/generate-ldm.js
 * Générer PDF lettre de mission (template OEC + substitution variables)
 * Déploiement: Netlify Function
 */

const { jsPDF } = require('jspdf');

// Template LDM officiel OEC (simplifié — en prod charger depuis PDF template)
function generateLDMTemplate(data) {
  const date = new Date();
  const dateStr = date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  return `
LETTRE DE MISSION
═══════════════════════════════════════════════════════════════

${dateStr}

${data.nom}
${data.adresse || '[Adresse à compléter]'}
${data.email}

Objet: Lettre de mission — ${data.missionType}

═══════════════════════════════════════════════════════════════

Madame, Monsieur,

Suite à votre demande du [DATE_CONTACT], nous vous proposons nos
services en tant que ${data.missionType || 'prestataire comptable'} pour
votre entreprise de forme juridique: ${data.organisation || 'Structure à préciser'}.

I. MISSIONS À EFFECTUER
════════════════════════

Vous nous demandez d'effectuer les missions suivantes:

• Expertise comptable et audit des comptes
  Type de mission: ${data.missionType || '—'}
  Spécificités: ${data.specificites || 'Conforme normes OEC'}

Durée: À compter du ${data.date_debut || 'date à préciser'}

II. TARIFICATION
════════════════════════

Honoraires annuels: ${data.tarif || '—'} € HT

Les frais seront facturés trimestriellement.

III. OBLIGATIONS LÉGALES - CONFORMITÉ RGPD & OEC
════════════════════════════════════════════════

1. Confidentialité
   Nous nous engageons au respect strict du secret professionnel en
   vertu des dispositions de l'Ordre des Experts-Comptables.

2. Traitement des données personnelles
   Conformément au Règlement Général sur la Protection des Données
   (RGPD), nous traitons vos données avec confidentialité absolue.

   Durée de conservation: 7 années (obligation légale OEC)
   Lieu de stockage: Serveurs sécurisés (OneDrive chiffré)
   Accès limité: Cabinet uniquement

3. Audit Trail
   Toutes les opérations sont enregistrées à titre de traçabilité
   (logs horodatés, utilisateurs, actions).

4. Droit d'accès et suppression
   Vous pouvez demander l'accès ou la suppression de vos données
   après délai légal de conservation.

IV. SIGNATURE ÉLECTRONIQUE
═════════════════════════

Ce document sera signé électroniquement via JeSigneExpert,
conforme au cadre légal eIDAS.

V. CONDITIONS GÉNÉRALES
═══════════════════════

• Résiliation: sur préavis de 30 jours
• Loi applicable: Droit français
• Juridiction: Tribunaux français

──────────────────────────────────────────────────────────────

CONSENTEMENT CLIENT:

Je reconnais avoir lu et accepté les conditions de cette lettre
de mission, notamment:
  ☐ Tarification et délais de facturation
  ☐ Confidentialité et traitement RGPD
  ☐ Durée légale de conservation (7 ans)
  ☐ Archivage sécurisé des documents

Signé électroniquement via JeSigneExpert.

Cordialement,

Cabinet: ${process.env.CABINET_NAME || 'Expertise Comptable'}

═══════════════════════════════════════════════════════════════
Conforme Ordre des Experts-Comptables (OEC)
RGPD compliant — Archivage 7 ans
═══════════════════════════════════════════════════════════════
`;
}

exports.handler = async (event, context) => {
  try {
    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        body: JSON.stringify({ error: 'Method not allowed' }),
      };
    }

    const missionData = JSON.parse(event.body);

    // Valider données requises
    if (!missionData.nom || !missionData.missionType || !missionData.organisation) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'Données manquantes: nom, missionType, organisation',
        }),
      };
    }

    // Générer contenu LDM
    const ldmContent = generateLDMTemplate(missionData);

    // Générer PDF
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true,
    });

    // Styles PDF
    pdf.setFont('Helvetica');
    pdf.setFontSize(11);
    pdf.setTextColor(10, 22, 40); // Navy

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 15;
    const maxWidth = pageWidth - 2 * margin;

    // Ajouter contenu (multi-page)
    const lines = pdf.splitTextToSize(ldmContent, maxWidth);
    let yPosition = margin;

    lines.forEach((line, index) => {
      // Ajouter page si nécessaire
      if (yPosition > pageHeight - margin) {
        pdf.addPage();
        yPosition = margin;

        // Header sur pages suivantes
        pdf.setFontSize(8);
        pdf.setTextColor(150, 150, 150);
        pdf.text('Lettre de Mission — Page suite', margin, margin - 5);

        pdf.setFontSize(11);
        pdf.setTextColor(10, 22, 40);
      }

      pdf.text(line, margin, yPosition);
      yPosition += 5;
    });

    // Footer toutes pages
    const pageCount = pdf.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      pdf.setPage(i);
      pdf.setFontSize(8);
      pdf.setTextColor(150, 150, 150);

      const footerY = pageHeight - 8;
      pdf.text(
        `Page ${i}/${pageCount} | Généré: ${new Date().toLocaleDateString('fr-FR')} | Confidentiel RGPD`,
        margin,
        footerY
      );
    }

    // Récupérer PDF en base64
    const pdfBuffer = Buffer.from(pdf.output('arraybuffer'));
    const pdfBase64 = pdfBuffer.toString('base64');
    const pdfHash = hashSHA256(pdfBuffer).substring(0, 16);
    const pdfDataUrl = `data:application/pdf;base64,${pdfBase64}`;

    // TODO: En production
    // 1. Upload PDF sur OneDrive
    // 2. Retourner URL OneDrive au lieu de data URL
    // 3. Sauvegarder metadata (prospectId, hash, timestamp) en DB

    // Log audit
    console.log('LDM générée:', {
      missionId: missionData.prospectId,
      prospect: missionData.nom,
      pdfHash,
      size: pdfBuffer.length,
      timestamp: new Date().toISOString(),
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        pdfUrl: pdfDataUrl,
        pdfHash,
        pdfSize: pdfBuffer.length,
        generatedAt: new Date().toISOString(),
        missionId: missionData.prospectId,
      }),
    };
  } catch (err) {
    console.error('Erreur generate-ldm:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};

/**
 * SHA256 hash pour vérification intégrité
 */
function hashSHA256(buffer) {
  return require('crypto')
    .createHash('sha256')
    .update(buffer)
    .digest('hex');
}
