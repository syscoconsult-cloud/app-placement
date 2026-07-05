import axios from 'axios';
import * as cheerio from 'cheerio';
import { BaseScraper, ScrapedProperty } from './base-scraper';

interface PAPListingElement {
  url?: string;
  title?: string;
  price?: string;
  surface?: string;
  location?: string;
  type?: string;
  rooms?: string;
  dpe?: string;
  description?: string;
}

export class PAPScraper extends BaseScraper {
  private baseUrl = 'https://www.pap.fr/immobilier/recherche';

  constructor(rateLimitMs: number = 3000) {
    super(rateLimitMs);
  }

  async scrape(searchParams: Record<string, string>): Promise<ScrapedProperty[]> {
    try {
      const url = this.buildSearchUrl(searchParams);
      console.log(`🔍 Scraping PAP: ${url}`);

      await this.applyRateLimit();

      const response = await axios.get(url, {
        headers: {
          'User-Agent': this.userAgent,
          'Accept-Language': 'fr-FR,fr;q=0.9',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        timeout: 15000,
      });

      const $ = cheerio.load(response.data);
      const properties: ScrapedProperty[] = [];

      // PAP listing structure: article.listingCard or similar container
      // Adjust selectors based on actual PAP HTML structure
      const listings = $('article[data-ad-id], div.listing-card, a.listing-item');

      console.log(`Found ${listings.length} listing containers`);

      listings.each((idx, element) => {
        try {
          const listing = this.parseListing($, element);
          if (listing && listing.title && listing.price) {
            properties.push({
              source: 'pap',
              source_url: listing.url || '',
              title: listing.title,
              price: this.normalizePrice(listing.price),
              surface_m2: listing.surface ? this.normalizeSurface(listing.surface) : undefined,
              city: this.extractCity(listing.location),
              postal_code: this.extractPostalCode(listing.location || ''),
              property_type: this.normalizePropertyType(listing.type),
              rooms: listing.rooms ? parseInt(listing.rooms, 10) : undefined,
              dpe_class: listing.dpe,
              description: listing.description,
              raw_data: {
                scraped_at: new Date().toISOString(),
                html_index: idx,
              },
            });
          }
        } catch (err) {
          console.warn(`Error parsing listing ${idx}:`, (err as Error).message);
        }
      });

      console.log(`✓ Extracted ${properties.length} properties from PAP`);
      return properties;
    } catch (err) {
      console.error('PAP scraper error:', err);
      throw err;
    }
  }

  private parseListing($: cheerio.CheerioAPI, element: cheerio.Element): PAPListingElement {
    const $el = $(element);

    // Common PAP selectors (may need adjustment)
    const url = $el.find('a[href*="/annonce"]').first().attr('href') || '';
    const title = $el.find('h2, .listing-title, a[href*="/annonce"]').first().text().trim();
    const price = $el.find('[data-price], .price, .listing-price').first().text().trim();
    const surface = $el.find('[data-surface], .surface, .listing-surface').first().text().trim();
    const location = $el.find('[data-location], .location, .listing-location, .city').text().trim();
    const type = $el.find('[data-type], .property-type, .type').first().text().trim();
    const rooms = $el.find('[data-rooms], .rooms').first().text().trim();
    const dpe = $el.find('[data-dpe], .dpe, .energy-class').first().text().trim();
    const description = $el.find('.description, .listing-desc').first().text().trim();

    return {
      url: url.startsWith('http') ? url : `https://www.pap.fr${url}`,
      title,
      price,
      surface,
      location,
      type,
      rooms,
      dpe,
      description,
    };
  }

  private extractCity(location: string): string | undefined {
    if (!location) return undefined;
    // Format: "75000 Paris" ou "Paris (75000)" ou "Reims, 51000"
    const parts = location.split(/[(),]/);
    const lastPart = parts[parts.length - 1].trim();
    // Return non-numeric part as city name
    return lastPart.replace(/\d{5}/, '').trim() || undefined;
  }

  private buildSearchUrl(params: Record<string, string>): string {
    const searchParams = new URLSearchParams();

    // Map common search parameters to PAP URL structure
    if (params.location) searchParams.set('location', params.location);
    if (params.typeID) searchParams.set('typeID', params.typeID); // 1=apartment, 2=house
    if (params.minPrice) searchParams.set('minPrice', params.minPrice);
    if (params.maxPrice) searchParams.set('maxPrice', params.maxPrice);
    if (params.minSurface) searchParams.set('minSurface', params.minSurface);
    if (params.maxSurface) searchParams.set('maxSurface', params.maxSurface);

    // Default to Paris if no location specified
    if (!params.location) {
      searchParams.set('location', 'Paris');
    }

    return `${this.baseUrl}?${searchParams.toString()}`;
  }
}

export default PAPScraper;
