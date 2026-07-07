/**
 * api-jesigneexpert.js — JeSigneExpert API wrapper
 * Gestion demandes de signature électronique
 *
 * Workflow:
 *   1. Upload LDM vers JeSigneExpert
 *   2. Créer demande signature (recipient = client)
 *   3. Webhook récoit statut (signé/rejeté)
 *   4. Télécharger LDM final signée
 */

class JeSigneExpertAPI {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://app.jesigneexpert.com/api'; // À adapter selon doc API
  }

  /**
   * Envoyer LDM à signature
   * @param {Object} signatureRequest
   *   - documentUrl: URL PDF (data: ou http:)
   *   - clientEmail: email signataire
   *   - clientName: nom complet signataire
   *   - missionId: ID mission (pour traçabilité)
   *   - expiryDays: durée validité lien (default 7)
   */
  async sendForSignature(signatureRequest) {
    try {
      const {
        documentUrl,
        clientEmail,
        clientName,
        missionId,
        expiryDays = 7,
      } = signatureRequest;

      if (!documentUrl || !clientEmail || !clientName) {
        throw new Error('Données manquantes: documentUrl, clientEmail, clientName');
      }

      // TODO: Appel API JeSigneExpert réel
      // Actuellement: backend function handle l'upload
      const response = await fetch('/.netlify/functions/send-to-signature', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          missionId,
          pdfUrl: documentUrl,
          clientEmail,
          clientName,
          expiryDays,
        }),
      });

      if (!response.ok) {
        throw new Error(`Send signature error: ${response.statusText}`);
      }

      const data = await response.json();

      // Log audit
      await fetch('/.netlify/functions/audit-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timestamp: new Date().toISOString(),
          action: 'signature_sent',
          missionId,
          details: {
            jeSigneExpertId: data.jeSigneExpertId,
            clientEmail,
          },
        }),
      });

      return {
        success: true,
        jeSigneExpertId: data.jeSigneExpertId,
        signatureLink: data.signatureLink,
        expiryDate: data.expiryDate,
      };
    } catch (err) {
      console.error('JeSigneExpert sendForSignature error:', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Récupérer statut signature
   */
  async getSignatureStatus(jeSigneExpertId) {
    try {
      const response = await fetch(
        `/.netlify/functions/signature-status?jeSigneExpertId=${jeSigneExpertId}`
      );

      if (!response.ok) {
        throw new Error(`Status error: ${response.statusText}`);
      }

      const data = await response.json();

      return {
        status: data.status, // 'en_attente', 'signee', 'rejected'
        signedAt: data.signedAt,
        rejectionReason: data.rejectionReason || null,
      };
    } catch (err) {
      console.error('JeSigneExpert getSignatureStatus error:', err);
      return { status: 'error', error: err.message };
    }
  }

  /**
   * Télécharger LDM signée
   */
  async downloadSignedDocument(jeSigneExpertId) {
    try {
      const response = await fetch(
        `/.netlify/functions/download-signed-ldm?jeSigneExpertId=${jeSigneExpertId}`
      );

      if (!response.ok) {
        throw new Error(`Download error: ${response.statusText}`);
      }

      // Retourner Blob pour download
      return response.blob();
    } catch (err) {
      console.error('JeSigneExpert downloadSignedDocument error:', err);
      return null;
    }
  }

  /**
   * Annuler demande signature (avant signature client)
   */
  async cancelSignatureRequest(jeSigneExpertId) {
    try {
      // TODO: API call to cancel

      console.log('Canceling signature request:', jeSigneExpertId);
      return true;
    } catch (err) {
      console.error('JeSigneExpert cancel error:', err);
      return false;
    }
  }

  /**
   * Relancer demande (si client oublie)
   */
  async resendSignatureRequest(jeSigneExpertId, clientEmail) {
    try {
      // TODO: API call to resend

      console.log('Resending signature request:', jeSigneExpertId, clientEmail);
      return true;
    } catch (err) {
      console.error('JeSigneExpert resend error:', err);
      return false;
    }
  }
}

// Export
window.JeSigneExpertAPI = JeSigneExpertAPI;
