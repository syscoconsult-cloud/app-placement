/**
 * functions/send-to-signature.js
 * Envoyer LDM à JeSigneExpert pour signature électronique
 */

exports.handler = async (event, context) => {
  try {
    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        body: JSON.stringify({ error: 'Method not allowed' }),
      };
    }

    const { missionId, pdfUrl, clientEmail, clientName } = JSON.parse(event.body);

    if (!missionId || !pdfUrl || !clientEmail) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Données manquantes' }),
      };
    }

    // TODO: Intégration JeSigneExpert API
    // 1. Télécharger PDF depuis pdfUrl
    // 2. Upload sur JeSigneExpert
    // 3. Créer demande de signature (recipient = clientEmail)
    // 4. Retourner jeSigneExpertId + lien signature

    // MVP: Stub retour
    const jeSigneExpertId = `jse_${missionId.substring(0, 8)}_${Date.now()}`;
    const signatureLink = `https://app.jesigneexpert.com/sign/${jeSigneExpertId}`;

    console.log('Signature sent:', {
      missionId,
      clientEmail,
      jeSigneExpertId,
      timestamp: new Date().toISOString(),
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        jeSigneExpertId,
        signatureLink,
        clientEmail,
        expiryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 jours
      }),
    };
  } catch (err) {
    console.error('Erreur send-to-signature:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
