/**
 * api-onedrive.js — OneDrive/Microsoft Graph API wrapper
 * Gestion dossiers client + upload docs + audit logs
 *
 * OAuth2 flow:
 *   1. Récupérer code authorization
 *   2. Échanger code → access token
 *   3. Utiliser token pour requêtes Graph API
 */

class OneDriveAPI {
  constructor(config) {
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret; // ⚠️ Ne jamais envoyer au client!
    this.tenantId = config.tenantId;
    this.redirectUri = config.redirectUri;
    this.cabinetFolderId = config.cabinetFolderId;
    this.baseUrl = 'https://graph.microsoft.com/v1.0';
    this.authUrl = 'https://login.microsoftonline.com';

    // Token stocké en sessionStorage (fallback)
    this.token = sessionStorage.getItem('onedrive_token');
  }

  /**
   * Démarrer flow OAuth2
   */
  initiateOAuth() {
    const state = Math.random().toString(36).substring(7);
    sessionStorage.setItem('oauth_state', state);

    const scope = 'files.readwrite.all';
    const oauthUrl = `${this.authUrl}/${this.tenantId}/oauth2/v2.0/authorize?` +
      `client_id=${this.clientId}` +
      `&redirect_uri=${encodeURIComponent(this.redirectUri)}` +
      `&response_type=code` +
      `&scope=${encodeURIComponent(scope)}` +
      `&state=${state}`;

    window.location.href = oauthUrl;
  }

  /**
   * Échanger code authorization → token (backend)
   * À appeler depuis callback page
   */
  async exchangeCodeForToken(code) {
    try {
      const response = await fetch('/.netlify/functions/auth-onedrive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, redirectUri: this.redirectUri }),
      });

      if (!response.ok) {
        throw new Error('Token exchange failed');
      }

      const data = await response.json();
      this.token = data.access_token;
      sessionStorage.setItem('onedrive_token', this.token);

      return true;
    } catch (err) {
      console.error('OneDrive exchangeCodeForToken error:', err);
      return false;
    }
  }

  /**
   * Créer dossier pour une mission
   */
  async createMissionFolder(missionId, prospectName) {
    if (!this.token) {
      console.error('OneDrive token manquant');
      return null;
    }

    try {
      const folderName = `${prospectName}_${missionId.substring(0, 8)}`;

      const response = await fetch(
        `${this.baseUrl}/me/drive/items/${this.cabinetFolderId}/children`,
        {
          method: 'POST',
          headers: this._getHeaders(),
          body: JSON.stringify({
            name: folderName,
            folder: {},
            '@microsoft.graph.conflictBehavior': 'rename',
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`OneDrive create folder error: ${response.statusText}`);
      }

      const folder = await response.json();
      return folder.id; // Retourner ID dossier
    } catch (err) {
      console.error('OneDrive createMissionFolder error:', err);
      return null;
    }
  }

  /**
   * Upload fichier vers dossier OneDrive
   */
  async uploadFile(folderId, fileName, fileBlob) {
    if (!this.token) {
      console.error('OneDrive token manquant');
      return null;
    }

    try {
      // URL upload simple
      const uploadUrl =
        `${this.baseUrl}/me/drive/items/${folderId}:/${encodeURIComponent(fileName)}:/content`;

      const response = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/octet-stream',
        },
        body: fileBlob,
      });

      if (!response.ok) {
        throw new Error(`OneDrive upload error: ${response.statusText}`);
      }

      const file = await response.json();
      return {
        id: file.id,
        name: file.name,
        webUrl: file.webUrl,
        size: file.size,
      };
    } catch (err) {
      console.error('OneDrive uploadFile error:', err);
      return null;
    }
  }

  /**
   * Télécharger fichier depuis OneDrive
   */
  async downloadFile(fileId) {
    if (!this.token) {
      console.error('OneDrive token manquant');
      return null;
    }

    try {
      const response = await fetch(
        `${this.baseUrl}/me/drive/items/${fileId}/content`,
        {
          headers: this._getHeaders(),
        }
      );

      if (!response.ok) {
        throw new Error(`OneDrive download error: ${response.statusText}`);
      }

      return response.blob();
    } catch (err) {
      console.error('OneDrive downloadFile error:', err);
      return null;
    }
  }

  /**
   * Créer audit logs fichier dans OneDrive
   */
  async createAuditLog(auditFolderId, logDate, logContent) {
    if (!this.token) {
      console.error('OneDrive token manquant');
      return null;
    }

    try {
      const fileName = `audit_${logDate}.csv`;
      const blob = new Blob([logContent], { type: 'text/csv' });

      return this.uploadFile(auditFolderId, fileName, blob);
    } catch (err) {
      console.error('OneDrive createAuditLog error:', err);
      return null;
    }
  }

  /**
   * Lister fichiers dans un dossier
   */
  async listFiles(folderId) {
    if (!this.token) {
      console.error('OneDrive token manquant');
      return [];
    }

    try {
      const response = await fetch(
        `${this.baseUrl}/me/drive/items/${folderId}/children`,
        {
          headers: this._getHeaders(),
        }
      );

      if (!response.ok) {
        throw new Error(`OneDrive list error: ${response.statusText}`);
      }

      const data = await response.json();
      return data.value || [];
    } catch (err) {
      console.error('OneDrive listFiles error:', err);
      return [];
    }
  }

  /**
   * Supprimer un fichier/dossier
   */
  async deleteFile(fileId) {
    if (!this.token) {
      console.error('OneDrive token manquant');
      return false;
    }

    try {
      const response = await fetch(
        `${this.baseUrl}/me/drive/items/${fileId}`,
        {
          method: 'DELETE',
          headers: this._getHeaders(),
        }
      );

      return response.ok;
    } catch (err) {
      console.error('OneDrive deleteFile error:', err);
      return false;
    }
  }

  /**
   * Vérifier si token est valide
   */
  isAuthenticated() {
    return !!this.token;
  }

  /**
   * Headers communs
   */
  _getHeaders() {
    return {
      'Authorization': `Bearer ${this.token}`,
      'Content-Type': 'application/json',
    };
  }
}

// Export
window.OneDriveAPI = OneDriveAPI;
