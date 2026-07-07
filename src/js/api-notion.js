/**
 * api-notion.js — Notion API wrapper (complète)
 * Lire/écrire infos prospect depuis DB Notion
 *
 * Champs attendus dans Notion :
 *   - Nom (title)
 *   - Email (email)
 *   - Telephone (text)
 *   - Type de Mission (select)
 *   - Organisation (select)
 *   - Tarif (number)
 *   - Spécificités (rich_text)
 *   - Date de Début (date)
 *   - Statut (status)
 *   - Adresse (text)
 */

class NotionAPI {
  constructor(token, databaseId) {
    this.token = token;
    this.databaseId = databaseId;
    this.baseUrl = 'https://api.notion.com/v1';
  }

  /**
   * Récupérer tous les prospects (non-archivés)
   */
  async fetchProspects(filter = {}) {
    try {
      const response = await fetch(`${this.baseUrl}/databases/${this.databaseId}/query`, {
        method: 'POST',
        headers: this._getHeaders(),
        body: JSON.stringify({
          filter: filter.statut
            ? {
                property: 'Statut',
                status: {
                  does_not_equal: 'Archivée',
                },
              }
            : undefined,
          sorts: filter.sortBy
            ? [{ property: filter.sortBy, direction: 'descending' }]
            : undefined,
          page_size: filter.pageSize || 100,
        }),
      });

      if (!response.ok) {
        throw new Error(`Notion API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return data.results
        .map(page => this.parsePage(page))
        .filter(p => p.nom); // Filter out empty
    } catch (err) {
      console.error('Notion fetchProspects error:', err);
      if (window.APP_CONFIG.debug) {
        console.error('Full error:', err);
      }
      return [];
    }
  }

  /**
   * Récupérer un prospect par ID
   */
  async fetchProspectById(prospectId) {
    try {
      const response = await fetch(`${this.baseUrl}/pages/${prospectId}`, {
        headers: this._getHeaders(),
      });

      if (!response.ok) {
        throw new Error(`Notion API error: ${response.statusText}`);
      }

      const page = await response.json();
      return this.parsePage(page);
    } catch (err) {
      console.error('Notion fetchProspectById error:', err);
      return null;
    }
  }

  /**
   * Créer un nouveau prospect
   */
  async createProspect(prospectData) {
    try {
      const response = await fetch(`${this.baseUrl}/pages`, {
        method: 'POST',
        headers: this._getHeaders(),
        body: JSON.stringify({
          parent: { database_id: this.databaseId },
          properties: {
            Nom: {
              title: [{ text: { content: prospectData.nom } }],
            },
            Email: {
              email: prospectData.email,
            },
            Telephone: {
              rich_text: [{ text: { content: prospectData.telephone || '' } }],
            },
            'Type de Mission': {
              select: { name: prospectData.type_mission },
            },
            Organisation: {
              select: { name: prospectData.organisation },
            },
            Tarif: {
              number: prospectData.tarif || 0,
            },
            Spécificités: {
              rich_text: [
                { text: { content: prospectData.specificites || '' } },
              ],
            },
            'Date de Début': {
              date: { start: prospectData.date_debut || new Date().toISOString() },
            },
            Statut: {
              status: { name: 'En cours' },
            },
            Adresse: {
              rich_text: [{ text: { content: prospectData.adresse || '' } }],
            },
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Notion create error: ${response.statusText}`);
      }

      const page = await response.json();
      return this.parsePage(page);
    } catch (err) {
      console.error('Notion createProspect error:', err);
      return null;
    }
  }

  /**
   * Mettre à jour statut prospect
   */
  async updateProspectStatus(prospectId, newStatus) {
    try {
      const response = await fetch(`${this.baseUrl}/pages/${prospectId}`, {
        method: 'PATCH',
        headers: this._getHeaders(),
        body: JSON.stringify({
          properties: {
            Statut: {
              status: { name: newStatus },
            },
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Notion update error: ${response.statusText}`);
      }

      return true;
    } catch (err) {
      console.error('Notion updateProspectStatus error:', err);
      return false;
    }
  }

  /**
   * Parser une page Notion → objet prospect
   */
  parsePage(page) {
    const props = page.properties;
    return {
      id: page.id,
      nom: this.getText(props.Nom),
      email: this.getEmail(props.Email),
      telephone: this.getText(props.Telephone),
      type_mission: this.getSelect(props['Type de Mission']),
      organisation: this.getSelect(props.Organisation),
      tarif: this.getNumber(props.Tarif),
      specificites: this.getText(props.Spécificités),
      adresse: this.getText(props.Adresse),
      date_debut: this.getDate(props['Date de Début']),
      statut: this.getStatus(props.Statut),
      created_time: page.created_time,
      last_edited_time: page.last_edited_time,
    };
  }

  /**
   * Helpers pour extraire différents types de propriétés
   */
  getText(prop) {
    if (!prop) return '';
    if (prop.type === 'title') return prop.title[0]?.plain_text || '';
    if (prop.type === 'rich_text') {
      return prop.rich_text.map(t => t.plain_text).join('');
    }
    return '';
  }

  getEmail(prop) {
    if (!prop || prop.type !== 'email') return '';
    return prop.email || '';
  }

  getNumber(prop) {
    return prop?.number || 0;
  }

  getDate(prop) {
    if (!prop || prop.type !== 'date') return '';
    return prop.date?.start || '';
  }

  getSelect(prop) {
    if (!prop || prop.type !== 'select') return '';
    return prop.select?.name || '';
  }

  getStatus(prop) {
    if (!prop || prop.type !== 'status') return 'En attente';
    return prop.status?.name || 'En attente';
  }

  /**
   * Headers communs pour toutes requêtes Notion
   */
  _getHeaders() {
    return {
      'Authorization': `Bearer ${this.token}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    };
  }
}

// Export
window.NotionAPI = NotionAPI;
