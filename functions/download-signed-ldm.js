/**
 * functions/download-signed-ldm.js
 * Télécharger LDM signée depuis JeSigneExpert
 */

exports.handler = async (event, context) => {
  try {
    const { jeSigneExpertId } = event.queryStringParameters || {};

    if (!jeSigneExpertId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'jeSigneExpertId manquant' }),
      };
    }

    // TODO: Intégration JeSigneExpert
    // 1. Récupérer le document signé via API JeSigneExpert
    // 2. Télécharger le PDF signé
    // 3. Retourner en tant que fichier binary

    // MVP: Retourner stub PDF
    const pdfContent = Buffer.from(
      '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R>>endobj 4 0 obj<</Length 44>>stream\nBT /F1 12 Tf 50 700 Td (LDM Signée) Tj ET\nendstream endobj xref 0 5 0000000000 65535 f 0000000009 00000 n 0000000058 00000 n 0000000115 00000 n 0000000214 00000 n trailer<</Size 5/Root 1 0 R>>startxref 307\n%%EOF'
    );

    console.log('Download signed LDM:', {
      jeSigneExpertId,
      timestamp: new Date().toISOString(),
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="LDM_Signee_${jeSigneExpertId.substring(0, 8)}.pdf"`,
      },
      body: pdfContent.toString('base64'),
      isBase64Encoded: true,
    };
  } catch (err) {
    console.error('Erreur download-signed-ldm:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
