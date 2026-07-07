/**
 * functions/auth-notion.js
 * OAuth2 pour Notion API (optionnel — on peut utiliser token direct)
 *
 * Notion support deux méthodes:
 *   1. Personal Access Token (simple, recommandé pour cabinet solo)
 *   2. OAuth2 (pour multi-workspace, plus complexe)
 *
 * MVP: On utilise token direct (config.js)
 * Future: Implémenter OAuth si besoin multi-workspace
 */

exports.handler = async (event, context) => {
  try {
    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        body: JSON.stringify({ error: 'Method not allowed' }),
      };
    }

    const { code, redirectUri } = JSON.parse(event.body);

    // TODO: Notion OAuth flow
    // https://developers.notion.com/docs/authorization/oauth

    console.log('Notion OAuth request received:', {
      timestamp: new Date().toISOString(),
      // Note: Notion OAuth not used in MVP
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        message:
          'Notion: Use Personal Access Token in config.js (OAuth not implemented yet)',
        note: 'Pour multi-workspace, implémenter full OAuth flow',
      }),
    };
  } catch (err) {
    console.error('Erreur auth-notion:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
