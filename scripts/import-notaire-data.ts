import NotaireImporter from '../lib/data-sources/notaire-importer';

/**
 * Import notaire and government price data
 * Enriches zone_stats with official reference prices
 */
async function importNotaireAndGovernmentData() {
  try {
    console.log('🏛️ Starting Notaire + Government Data Import');
    console.log('=' .repeat(50));

    const importer = new NotaireImporter();

    // Step 1: Import PERVAL (notaire official prices)
    console.log('\n[1/3] PERVAL (Notaire Official Prices)');
    let pervalCount = 0;
    try {
      pervalCount = await importer.importPervalData();
    } catch (err) {
      console.warn('⚠️  PERVAL import skipped:', (err as Error).message);
    }

    // Step 2: Import other government sources
    console.log('\n[2/3] Other Government Sources');
    let govCount = 0;
    try {
      govCount = await importer.importFromGovernmentSource();
    } catch (err) {
      console.warn('⚠️  Government sources skipped:', (err as Error).message);
    }

    // Step 3: Enrich zone statistics
    console.log('\n[3/3] Enriching Zone Statistics');
    try {
      await importer.enrichZoneStats();
    } catch (err) {
      console.warn('⚠️  Zone enrichment skipped:', (err as Error).message);
    }

    console.log('\n' + '='.repeat(50));
    console.log('✅ Import Completed Successfully');
    console.log(`   - PERVAL records: ${pervalCount}`);
    console.log(`   - Government records: ${govCount}`);
    console.log(`   - Total: ${pervalCount + govCount} price records imported`);
    console.log('\nNext: Compare notaire prices with DVF and scraper data');

    process.exit(0);
  } catch (err) {
    console.error('💥 Fatal error:', err);
    process.exit(1);
  }
}

importNotaireAndGovernmentData();
