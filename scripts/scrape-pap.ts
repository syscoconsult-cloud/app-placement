import PAPScraper from '../lib/scrapers/pap-scraper';
import { upsertProperties, markStaleListingsAsInactive } from '../lib/property-service';

interface ScraperConfig {
  locations: Array<{ name: string; typeID?: string }>;
  minPrice?: number;
  maxPrice?: number;
  minSurface?: number;
  maxSurface?: number;
  dryRun?: boolean;
}

const defaultConfig: ScraperConfig = {
  locations: [
    { name: 'Paris', typeID: '1' }, // 1 = apartments
    { name: 'Paris', typeID: '2' }, // 2 = houses
  ],
};

async function runScraper(config: ScraperConfig = defaultConfig) {
  const scraper = new PAPScraper(3000); // 3s rate limit
  let totalProperties = 0;
  let totalErrors: string[] = [];

  console.log('🚀 Starting PAP scraper...');
  console.log(`📍 Scraping locations: ${config.locations.map(l => l.name).join(', ')}`);

  try {
    for (const location of config.locations) {
      console.log(`\n📍 Scraping ${location.name}...`);

      try {
        const searchParams: Record<string, string> = {
          location: location.name,
        };

        if (location.typeID) searchParams.typeID = location.typeID;
        if (config.minPrice) searchParams.minPrice = config.minPrice.toString();
        if (config.maxPrice) searchParams.maxPrice = config.maxPrice.toString();
        if (config.minSurface) searchParams.minSurface = config.minSurface.toString();
        if (config.maxSurface) searchParams.maxSurface = config.maxSurface.toString();

        const properties = await scraper.scrape(searchParams);

        if (config.dryRun) {
          console.log(`[DRY RUN] Would insert ${properties.length} properties`);
          if (properties.length > 0) {
            console.log('Sample property:', JSON.stringify(properties[0], null, 2));
          }
        } else {
          const result = await upsertProperties(properties, 'pap');

          console.log(`✓ ${location.name}:`);
          console.log(`  - Inserted: ${result.inserted}`);
          console.log(`  - Updated: ${result.updated}`);
          console.log(`  - Failed: ${result.failed}`);

          if (result.errors.length > 0) {
            console.warn(`  Errors: ${result.errors.slice(0, 3).join('; ')}`);
            totalErrors = totalErrors.concat(result.errors);
          }

          totalProperties += result.inserted + result.updated;
        }
      } catch (err) {
        console.error(`❌ Error scraping ${location.name}:`, (err as Error).message);
        totalErrors.push(`${location.name}: ${(err as Error).message}`);
      }
    }

    if (!config.dryRun) {
      console.log('\n🧹 Marking stale listings as inactive...');
      const staleCount = await markStaleListingsAsInactive('pap', 7);
      console.log(`  - Marked ${staleCount} stale listings as inactive`);
    }

    console.log('\n✅ Scraper completed');
    console.log(`  - Total properties processed: ${totalProperties}`);

    if (totalErrors.length > 0) {
      console.log(`  - Total errors: ${totalErrors.length}`);
      if (totalErrors.length <= 5) {
        totalErrors.forEach(err => console.warn(`    • ${err}`));
      }
    }

    process.exit(0);
  } catch (err) {
    console.error('💥 Fatal error:', err);
    process.exit(1);
  }
}

// Parse CLI arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const configOverride: Partial<ScraperConfig> = {};

if (isDryRun) {
  configOverride.dryRun = true;
  console.log('Running in DRY RUN mode (no database writes)');
}

// Custom location from CLI: node script.ts --location "Reims" --location "Lyon"
const locationIndex = args.findIndex(arg => arg === '--location');
if (locationIndex !== -1) {
  configOverride.locations = [];
  for (let i = locationIndex + 1; i < args.length && !args[i].startsWith('--'); i++) {
    configOverride.locations.push({ name: args[i] });
  }
}

const finalConfig = { ...defaultConfig, ...configOverride };
runScraper(finalConfig);
