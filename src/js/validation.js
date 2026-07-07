/**
 * validation.js — Validation documents client-side
 * Vérifier formats, tailles, type fichiers avant upload
 */

class DocumentValidator {
  constructor() {
    this.MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
    this.ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
    this.ALLOWED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png'];
  }

  /**
   * Valide un fichier avant upload
   * @param {File} file — fichier à valider
   * @param {string} documentType — 'identite', 'kbis', 'statuts'
   * @returns {Object} { valid: boolean, error: string }
   */
  validateFile(file, documentType) {
    // Vérifier type MIME
    if (!this.ALLOWED_TYPES.includes(file.type)) {
      return {
        valid: false,
        error: `Format invalide. Formats acceptés: PDF, JPEG, PNG (reçu: ${file.type})`,
      };
    }

    // Vérifier extension
    const ext = this.getFileExtension(file.name);
    if (!this.ALLOWED_EXTENSIONS.includes(ext)) {
      return {
        valid: false,
        error: `Extension invalide: ${ext}`,
      };
    }

    // Vérifier taille
    if (file.size > this.MAX_FILE_SIZE) {
      return {
        valid: false,
        error: `Fichier trop volumineux (${this.formatSize(file.size)} > ${this.formatSize(this.MAX_FILE_SIZE)})`,
      };
    }

    // Vérifications spécifiques par type
    if (documentType === 'identite') {
      return this.validateIdentite(file);
    } else if (documentType === 'kbis') {
      return this.validateKBIS(file);
    } else if (documentType === 'statuts') {
      return this.validateStatuts(file);
    }

    return { valid: true };
  }

  validateIdentite(file) {
    // Pièce identité = PDF ou scan image seulement
    if (!['application/pdf', 'image/jpeg', 'image/png'].includes(file.type)) {
      return {
        valid: false,
        error: 'Pièce identité: PDF ou image JPEG/PNG requis',
      };
    }

    // Taille minimale (scan complet)
    if (file.size < 50 * 1024) {
      return {
        valid: false,
        error: 'Pièce identité: fichier trop petit (minimum 50 KB)',
      };
    }

    return { valid: true };
  }

  validateKBIS(file) {
    // KBIS = PDF obligatoire (format légal)
    if (file.type !== 'application/pdf') {
      return {
        valid: false,
        error: 'KBIS: fichier PDF requis (format légal)',
      };
    }

    return { valid: true };
  }

  validateStatuts(file) {
    // Statuts = PDF ou image
    if (!['application/pdf', 'image/jpeg', 'image/png'].includes(file.type)) {
      return {
        valid: false,
        error: 'Statuts: PDF ou image JPEG/PNG requis',
      };
    }

    return { valid: true };
  }

  getFileExtension(filename) {
    return ('.' + filename.split('.').pop()).toLowerCase();
  }

  formatSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  /**
   * Hash SHA-256 pour vérifier intégrité fichier
   * @param {File} file
   * @returns {Promise<string>} hex hash
   */
  async hashFile(file) {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
}

// Export
window.DocumentValidator = DocumentValidator;
