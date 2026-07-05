import NotaireImporter from '../lib/data-sources/notaire-importer';
import INSEEImporter from '../lib/data-sources/insee-importer';
import RentalImporter from '../lib/data-sources/rental-importer';

/**
 * Master import script: Download and sync all data sources
 * Run this to populate the complete database with:
 * - DVF (historical transactions)
 * - PERVAL (notaire official prices)
 * - INSEE (demographics, geolocation)
 * - ANIL/CLAMEUR (rental prices)
 */
async function importAllData() {
  try {
    console.log('🌍 Real Estate Data Import — Complete Pipeline');
    console.log('='.repeat(60));
    console.log('This will import from:');
    console.log('  1. DVF (Government transactions)');
    console.log('  2. PERVAL (Notaire prices)');
    console.log('  3. INSEE (Demographics)');
    console.log('  4. ANIL/CLAMEUR (Rental prices)');
    console.log('='.repeat(60));

    const startTime = Date.now();

    // Step 1: Notaire data (combines DVF in upsert)
    console.log('\n[1/4] PERVAL (Notaire Official Prices)');
    const notaireImporter = new NotaireImporter();
    let pervalCount = 0;
    try {
      pervalCount = await notaireImporter.importPervalData();
    } catch (err) {
      console.warn('⚠️  PERVAL skipped:', (err as Error).message);
    }

    // Step 2: INSEE data
    console.log('\n[2/4] INSEE (Demographics & Geolocation)');
    const inseeImporter = new INSEEImporter();
    let inseeCount = 0;
    try {
      inseeCount = await inseeImporter.importINSEEDemographics();
    } catch (err) {
      console.warn('⚠️  INSEE skipped:', (err as Error).message);
    }

    // Step 3: Rental data
    console.log('\n[3/4] ANIL Rental Data (Loyers et Charges)');
    const rentalImporter = new RentalImporter();

    // Create rental stats table first
    try {
      await rentalImporter.createRentalStatsTable();
    } catch (err) {
      console.warn('⚠️  Rental table creation skipped');
    }

    let anilCount = 0;
    try {
      anilCount = await rentalImporter.importANILRentalData();
    } catch (err) {
      console.warn('⚠️  ANIL import skipped:', (err as Error).message);
    }

    console.log('\n[4/4] CLAMEUR Rental Evolution');
    let clameurCount = 0;
    try {
      clameurCount = await rentalImporter.importCLAMEURData();
    } catch (err) {
      console.warn('⚠️  CLAMEUR import skipped:', (err as Error).message);
    }

    // Summary
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('\n' + '='.repeat(60));
    console.log('✅ Import Pipeline Completed');
    console.log(`Duration: ${duration}s`);
    console.log('\nRecords imported:');
    console.log(`  • PERVAL:  ${pervalCount} zone statistics`);
    console.log(`  • INSEE:   ${inseeCount} communes`);
    console.log(`  • ANIL:    ${anilCount} rental records`);
    console.log(`  • CLAMEUR: ${clameurCount} rental evolution`);
    console.log(`  • TOTAL:   ${pervalCount + inseeCount + anilCount + clameurCount} records`);

    console.log('\n📊 Next Steps:');
    console.log('  1. npm run scrape-pap            (Get current listings)');
    console.log('  2. npm run compare-prices        (Validate data)');
    console.log('  3. npm run dev                   (Start frontend)');

    console.log('\n💡 Data is now ready for scoring and alerts!');

    process.exit(0);
  } catch (err) {
    console.error('💥 Fatal error:', err);
    process.exit(1);
  }
}

// Run with CLI argument to import specific sources
const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('Usage: npm run import-all-data [options]');
  console.log('Options:');
  console.log('  (no args)     Import all sources');
  console.log('  --perval      PERVAL only');
  console.log('  --insee       INSEE only');
  console.log('  --rental      ANIL/CLAMEUR only');
  process.exit(0);
}

importAllData();
