/**
 * functions/signature-status.js
 * Récupérer le statut de signature depuis JeSigneExpert
 * Called every 10s par tracking.html
 */

exports.handler = async (event, context) => {
  try {
    const { missionId, jeSigneExpertId } = event.queryStringParameters || {};

    if (!missionId || !jeSigneExpertId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Paramètres manquants' }),
      };
    }

    // TODO: Intégration JeSigneExpert API
    // Récupérer statut signature depuis jeSigneExpertId

    // MVP: Stub — simuler progression
    const createdTime = parseInt(jeSigneExpertId.split('_')[3]) || Date.now();
    const elapsedSeconds = (Date.now() - createdTime) / 1000;

    let status = 'en_attente';
    let signedAt = null;

    // Simuler: signature après 30 secondes (pour demo)
    if (elapsedSeconds > 30) {
      status = 'signee';
      signedAt = new Date(createdTime + 30000).toISOString();
    }

    console.log('Status check:', {
      missionId,
      jeSigneExpertId,
      status,
      elapsedSeconds,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        status, // 'en_attente', 'signee', 'rejected'
        clientName: 'Prospect Name',
        clientEmail: 'prospect@example.com',
        generatedAt: new Date(createdTime).toISOString(),
        sentAt: new Date(createdTime).toISOString(),
        signedAt,
        archived: false,
        archivedAt: null,
      }),
    };
  } catch (err) {
    console.error('Erreur signature-status:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
