export interface ScrapedProperty {
  source: string;
  source_url: string;
  title: string;
  price: number;
  surface_m2?: number;
  city?: string;
  postal_code?: string;
  property_type?: string;
  rooms?: number;
  dpe_class?: string;
  description?: string;
  raw_data: Record<string, any>;
}

export abstract class BaseScraper {
  protected rateLimitMs: number;
  protected userAgent: string;
  protected lastRequestTime: number = 0;

  constructor(rateLimitMs: number = 2000) {
    this.rateLimitMs = rateLimitMs;
    this.userAgent =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  }

  protected async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  protected async applyRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.rateLimitMs) {
      await this.sleep(this.rateLimitMs - timeSinceLastRequest);
    }
    this.lastRequestTime = Date.now();
  }

  protected normalizePrice(price: string | number): number {
    if (typeof price === 'number') return price;
    const cleaned = price.replace(/[^\d]/g, '');
    return parseInt(cleaned, 10);
  }

  protected normalizeSurface(surface: string | number): number | undefined {
    if (!surface) return undefined;
    if (typeof surface === 'number') return surface;
    const cleaned = surface.replace(/[^\d.]/g, '');
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? undefined : parsed;
  }

  protected normalizePropertyType(type: string | undefined): string | undefined {
    if (!type) return undefined;
    const normalized = type.toLowerCase().trim();
    const typeMap: Record<string, string> = {
      'appartement': 'apartment',
      'appart': 'apartment',
      'studio': 'apartment',
      'maison': 'house',
      'house': 'house',
      'terrain': 'land',
      'land': 'land',
      't1': 'apartment',
      't2': 'apartment',
      't3': 'apartment',
      't4': 'apartment',
      't5': 'apartment',
    };
    return typeMap[normalized] || normalized;
  }

  protected extractPostalCode(text: string): string | undefined {
    const match = text.match(/(\d{5})/);
    return match ? match[1] : undefined;
  }

  abstract scrape(url: string): Promise<ScrapedProperty[]>;
}
