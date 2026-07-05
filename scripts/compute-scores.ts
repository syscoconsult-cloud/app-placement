import ScoringEngine from '../lib/scoring-engine';

/**
 * Compute and store deal scores for all active properties
 * Run this daily after scraping to have fresh scores
 */
async function computeScores() {
  try {
    console.log('📊 Computing property deal scores...');
    console.log('='.repeat(50));

    const startTime = Date.now();

    const scoredCount = await ScoringEngine.scoreAndStoreProperties();

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('\n' + '='.repeat(50));
    console.log('✅ Scoring completed');
    console.log(`   Duration: ${duration}s`);
    console.log(`   Properties scored: ${scoredCount}`);
    console.log('\n📈 Score components:');
    console.log('   • Discount (40%): How much below market price');
    console.log('   • Rental Yield (25%): Expected annual return');
    console.log('   • Zone Dynamics (20%): Market trend (3-year)');
    console.log('   • Quality (15%): DPE + location + demographics');

    console.log('\nScore interpretation:');
    console.log('   70-100: Excellent deal 🟢');
    console.log('   60-70:  Good deal 🟡');
    console.log('   50-60:  Average deal ⚪');
    console.log('   <50:    Poor deal 🔴');

    process.exit(0);
  } catch (err) {
    console.error('💥 Error:', err);
    process.exit(1);
  }
}

computeScores();
