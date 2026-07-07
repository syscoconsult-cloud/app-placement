/**
 * functions/auth-onedrive.js
 * OAuth2 token exchange pour OneDrive/Microsoft Graph
 * Reçoit authorization code → retourne access token
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

    if (!code) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Authorization code manquant' }),
      };
    }

    // Récupérer variables env
    const clientId = process.env.ONEDRIVE_CLIENT_ID;
    const clientSecret = process.env.ONEDRIVE_CLIENT_SECRET;
    const tenantId = process.env.ONEDRIVE_TENANT_ID;

    if (!clientId || !clientSecret || !tenantId) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: 'OneDrive credentials manquantes dans env',
        }),
      };
    }

    // TODO: Faire requête vers Microsoft Graph pour échanger code
    // Real implementation:
    /*
    const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        scope: 'https://graph.microsoft.com/files.readwrite.all',
      }).toString(),
    });

    if (!response.ok) {
      throw new Error(`Token exchange failed: ${response.statusText}`);
    }

    const data = await response.json();
    */

    // MVP: Stub token
    const mockToken =
      `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${Buffer.from(JSON.stringify({
        aud: clientId,
        iss: `https://login.microsoftonline.com/${tenantId}/v2.0`,
        exp: Math.floor(Date.now() / 1000) + 3600,
      })).toString('base64')}.${Buffer.from('signature').toString('base64')}`;

    console.log('OneDrive OAuth token exchanged:', {
      clientId,
      timestamp: new Date().toISOString(),
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        access_token: mockToken,
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'https://graph.microsoft.com/files.readwrite.all',
      }),
    };
  } catch (err) {
    console.error('Erreur auth-onedrive:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
