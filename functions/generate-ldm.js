/**
 * functions/generate-ldm.js
 * Générer PDF lettre de mission (template OEC + substitution variables)
 * Déploiement: Netlify Function
 */

const { jsPDF } = require('jspdf');

// Template LDM simplifié (en production, charger depuis template.pdf officiel OEC)
const TEMPLATE_LDM = `
LETTRE DE MISSION
═══════════════════════════════════════════════════════════════

À [DATE]

[NOM_PROSPECT]
[ADRESSE]

OBJET: Lettre de mission — [TYPE_MISSION]

═══════════════════════════════════════════════════════════════

Madame, Monsieur,

En réponse à votre demande, nous vous proposons nos services
en tant que [TYPE_MISSION] pour votre structure juridique de type
[ORGANISATION].

ÉTENDUE DE LA MISSION:
───────────────────────
• Type: [TYPE_MISSION]
• Période: à partir du [DATE_DEBUT]
• Tarif annuel: [TARIF] €

SPÉCIFICITÉS:
[SPECIFICITES]

OBLIGATIONS DE CONFIDENTIALITÉ:
───────────────────────────────
Conformément aux dispositions de l'Ordre des Experts-Comptables
et aux règles de la CNIL (RGPD), nous nous engageons à assurer
la confidentialité absolue de vos données personnelles et
documents comptables.

Durée de conservation: 7 ans (obligation légale OEC)

CONSENTEMENT DONNÉES:
────────────────────
☐ J'accepte le traitement de mes données conformément à la
  politique de confidentialité annexée.

À signer électroniquement via JeSigneExpert.

Cordialement,

Le cabinet
[CABINET_NAME]

═══════════════════════════════════════════════════════════════
`;

exports.handler = async (event, context) => {
  try {
    // Parse request
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
        body: JSON.stringify({ error: 'Données manquantes' }),
      };
    }

    // Substituer variables dans template
    let ldmContent = TEMPLATE_LDM
      .replace('[NOM_PROSPECT]', missionData.nom || '')
      .replace('[ADRESSE]', missionData.adresse || 'Adresse à remplir')
      .replace('[TYPE_MISSION]', missionData.missionType || '')
      .replace('[ORGANISATION]', missionData.organisation || '')
      .replace('[TARIF]', missionData.tarif || '0')
      .replace('[DATE_DEBUT]', missionData.date_debut || new Date().toISOString().split('T')[0])
      .replace('[SPECIFICITES]', missionData.specificites || 'Néant')
      .replace('[DATE]', new Date().toISOString().split('T')[0])
      .replace('[CABINET_NAME]', process.env.CABINET_NAME || 'Cabinet Expertise Comptable');

    // Générer PDF
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    // Police et mise en page
    pdf.setFont('Helvetica');
    pdf.setFontSize(10);
    pdf.setTextColor(10, 22, 40); // Navy color

    // Contenu PDF
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 15;
    const maxWidth = pageWidth - 2 * margin;

    let yPosition = margin;

    // Split texte et ajouter lignes
    const lines = pdf.splitTextToSize(ldmContent, maxWidth);
    lines.forEach(line => {
      if (yPosition > pageHeight - margin) {
        pdf.addPage();
        yPosition = margin;
      }
      pdf.text(line, margin, yPosition);
      yPosition += 5;
    });

    // Footer
    pdf.setFontSize(8);
    pdf.setTextColor(100, 116, 139); // Muted color
    pdf.text(
      `Généré le ${new Date().toISOString()} - Confidentiel - RGPD Compliant`,
      margin,
      pageHeight - margin + 5
    );

    // Récupérer PDF en base64
    const pdfBuffer = Buffer.from(pdf.output('arraybuffer'));
    const pdfBase64 = pdfBuffer.toString('base64');

    // En production: sauvegarder sur OneDrive + retourner URL
    // Pour MVP: retourner data URL
    const pdfDataUrl = `data:application/pdf;base64,${pdfBase64}`;

    // Log audit
    console.log('LDM générée:', {
      missionId: missionData.prospectId,
      prospect: missionData.nom,
      timestamp: new Date().toISOString(),
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        pdfUrl: pdfDataUrl,
        pdfHash: hashSHA256(pdfBuffer).substring(0, 16),
        generatedAt: new Date().toISOString(),
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
 * Simple SHA256 hash pour vérification intégrité
 * En production, utiliser crypto library
 */
function hashSHA256(buffer) {
  return require('crypto')
    .createHash('sha256')
    .update(buffer)
    .digest('hex');
}
