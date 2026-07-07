/**
 * functions/audit-log.js
 * Enregistrer audit logs sur OneDrive (conformité RGPD/OEC)
 * POST de la part du client (audit.js)
 */

exports.handler = async (event, context) => {
  try {
    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        body: JSON.stringify({ error: 'Method not allowed' }),
      };
    }

    const auditEntry = JSON.parse(event.body);

    // Valider structure
    if (!auditEntry.timestamp || !auditEntry.action) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Audit entry invalide' }),
      };
    }

    // TODO: Sauvegarder dans OneDrive
    // 1. Formatter: CSV ou JSON
    // 2. Upload/append sur OneDrive/Audit Logs/[DATE].csv
    // 3. Vérifier expiration (retentionDays)
    // 4. Supprimer old logs

    console.log('Audit log recorded:', {
      timestamp: auditEntry.timestamp,
      action: auditEntry.action,
      missionId: auditEntry.missionId,
      userId: auditEntry.userId,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        logged: true,
        timestamp: new Date().toISOString(),
      }),
    };
  } catch (err) {
    console.error('Erreur audit-log:', err);
    // Ne pas bloquer si audit échoue (fallback client-side)
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: false,
        error: err.message,
        note: 'Audit fallback to local storage',
      }),
    };
  }
};
