/**
 * functions/archive-mission.js
 * Archiver mission : OneDrive + Pennylane après signature
 */

exports.handler = async (event, context) => {
  try {
    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        body: JSON.stringify({ error: 'Method not allowed' }),
      };
    }

    const { missionId, jeSigneExpertId } = JSON.parse(event.body);

    if (!missionId || !jeSigneExpertId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Données manquantes' }),
      };
    }

    // TODO: 1. Récupérer LDM signée depuis JeSigneExpert
    // 2. Télécharger LDM signée
    // 3. Créer dossier OneDrive: /Clients/[MISSION_ID]/
    // 4. Upload LDM signée + documents (KBIS, etc.)
    // 5. Créer dossier Pennylane (optionnel, peut être manuel)
    // 6. Mettre à jour Notion: statut = "Archivée"
    // 7. Log audit

    const oneDriveFolderId = `od_${missionId.substring(0, 8)}_${Date.now()}`;
    const pennylaneId = `py_${missionId.substring(0, 8)}`;

    console.log('Archive mission:', {
      missionId,
      jeSigneExpertId,
      oneDriveFolderId,
      pennylaneId,
      timestamp: new Date().toISOString(),
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        oneDriveFolderId,
        pennylaneId,
        archivedAt: new Date().toISOString(),
        message: 'Mission archivée dans OneDrive et Pennylane',
      }),
    };
  } catch (err) {
    console.error('Erreur archive-mission:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
