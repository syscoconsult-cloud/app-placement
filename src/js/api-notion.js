/**
 * api-notion.js — Notion API wrapper
 * Lire infos prospect depuis DB Notion
 */

class NotionAPI {
  constructor(token, databaseId) {
    this.token = token;
    this.databaseId = databaseId;
    this.baseUrl = 'https://api.notion.com/v1';
  }

  async fetchProspects() {
    try {
      const response = await fetch(`${this.baseUrl}/databases/${this.databaseId}/query`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filter: {
            property: 'Statut',
            status: {
              does_not_equal: 'Archivée',
            },
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Notion API error: ${response.statusText}`);
      }

      const data = await response.json();
      return data.results.map(page => this.parsePage(page));
    } catch (err) {
      console.error('Notion fetchProspects error:', err);
      return [];
    }
  }

  async fetchProspectById(prospectId) {
    try {
      const response = await fetch(`${this.baseUrl}/pages/${prospectId}`, {
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Notion-Version': '2022-06-28',
        },
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

  parsePage(page) {
    const props = page.properties;
    return {
      id: page.id,
      nom: this.getText(props.Nom),
      email: this.getText(props.Email),
      telephone: this.getText(props.Telephone),
      type_mission: this.getText(props['Type de Mission']),
      organisation: this.getText(props.Organisation),
      tarif: this.getNumber(props.Tarif),
      specificites: this.getText(props.Spécificités),
      date_debut: this.getDate(props['Date de Début']),
      statut: this.getStatus(props.Statut),
    };
  }

  getText(prop) {
    if (!prop) return '';
    if (prop.type === 'title') return prop.title[0]?.plain_text || '';
    if (prop.type === 'rich_text') return prop.rich_text[0]?.plain_text || '';
    return '';
  }

  getNumber(prop) {
    return prop?.number || 0;
  }

  getDate(prop) {
    return prop?.date?.start || '';
  }

  getStatus(prop) {
    return prop?.status?.name || 'En attente';
  }
}

// Export
window.NotionAPI = NotionAPI;
