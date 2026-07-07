/**
 * audit.js — Audit logging pour conformité OEC/RGPD
 * Enregistrer tous les événements (accès, modification, suppression)
 */

class AuditLogger {
  constructor(config) {
    this.enabled = config.enabled;
    this.storageProvider = config.storageProvider; // 'onedrive'
    this.retentionDays = config.retentionDays; // 2555 = 7 ans
    this.logs = [];
  }

  /**
   * Enregistrer un événement audit
   * @param {Object} event — { action, missionId, details, userId }
   */
  async log(event) {
    if (!this.enabled) return;

    const auditEntry = {
      timestamp: new Date().toISOString(),
      action: event.action, // 'document_upload', 'ldm_generated', 'signature_sent', etc.
      missionId: event.missionId,
      userId: event.userId || 'unknown',
      ip: event.ip || 'unknown', // À récupérer via backend
      userAgent: navigator.userAgent,
      details: event.details || {},
      expirationDate: this.calculateExpirationDate(),
    };

    this.logs.push(auditEntry);

    // Envoyer au backend (OneDrive)
    try {
      await this.sendToBackend(auditEntry);
    } catch (err) {
      console.error('Audit log error:', err);
      // Ne pas bloquer l'app si audit échoue
      // Mais logger quand même localement
      this.storeLocally(auditEntry);
    }
  }

  /**
   * Envoyer log audit au backend (OneDrive)
   */
  async sendToBackend(auditEntry) {
    const response = await fetch('/.netlify/functions/audit-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(auditEntry),
    });

    if (!response.ok) {
      throw new Error(`Audit backend error: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Stocker localement (fallback)
   */
  storeLocally(auditEntry) {
    const logs = JSON.parse(localStorage.getItem('auditLogs') || '[]');
    logs.push(auditEntry);
    localStorage.setItem('auditLogs', JSON.stringify(logs));
  }

  /**
   * Calculer date d'expiration selon RGPD/OEC
   */
  calculateExpirationDate() {
    const expDate = new Date();
    expDate.setDate(expDate.getDate() + this.retentionDays);
    return expDate.toISOString();
  }

  /**
   * Helper — log des actions courantes
   */
  async logDocumentUpload(missionId, documentType, hash) {
    await this.log({
      action: 'document_upload',
      missionId,
      details: {
        documentType,
        hash,
      },
    });
  }

  async logLDMGenerated(missionId, pdfHash) {
    await this.log({
      action: 'ldm_generated',
      missionId,
      details: {
        pdfHash,
      },
    });
  }

  async logSignatureSent(missionId, jeSigneExpertId) {
    await this.log({
      action: 'signature_sent',
      missionId,
      details: {
        jeSigneExpertId,
      },
    });
  }

  async logSignatureReceived(missionId, jeSigneExpertId, ldmFinalHash) {
    await this.log({
      action: 'signature_received',
      missionId,
      details: {
        jeSigneExpertId,
        ldmFinalHash,
      },
    });
  }

  async logArchived(missionId, oneDriveFolderId, pennylaneId) {
    await this.log({
      action: 'archived',
      missionId,
      details: {
        oneDriveFolderId,
        pennylaneId,
      },
    });
  }

  async logAccess(missionId, accessType) {
    await this.log({
      action: 'access',
      missionId,
      details: {
        accessType, // 'view', 'edit', 'download'
      },
    });
  }
}

// Export
window.AuditLogger = AuditLogger;
