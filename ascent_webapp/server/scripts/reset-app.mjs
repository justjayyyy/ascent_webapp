import 'dotenv/config';
import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not found in environment variables');
  process.exit(1);
}

async function resetApp() {
  // CRITICAL SAFETY: Block production databases completely
  const isProduction = MONGODB_URI.includes('mongodb.net') || 
                       MONGODB_URI.includes('atlas') ||
                       process.env.NODE_ENV === 'production';
  
  if (isProduction) {
    console.error('\n❌ ❌ ❌ CRITICAL SAFETY BLOCK ❌ ❌ ❌');
    console.error('❌ This script is BLOCKED for production databases!');
    console.error('❌ Production database detected:', MONGODB_URI.includes('atlas') ? 'MongoDB Atlas' : 'Production');
    console.error('❌ Script aborted for safety.');
    console.error('❌ If you need to reset production, do it manually through MongoDB Atlas UI.');
    console.error('❌ NEVER run destructive scripts against production databases!\n');
    process.exit(1);
  }

  console.log('🚀 Connecting to MongoDB...');
  
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected!\n');

    const db = mongoose.connection.db;

    // EXTREME SAFETY CHECK - Require explicit confirmation
    const readline = await import('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const question = (prompt) => new Promise((resolve) => rl.question(prompt, resolve));

    console.log('⚠️  ⚠️  ⚠️  CRITICAL WARNING ⚠️  ⚠️  ⚠️');
    console.log('⚠️  This will PERMANENTLY DELETE ALL DATA from the database!');
    console.log('⚠️  This action CANNOT be undone!');
    console.log('⚠️  Make sure you have backups before proceeding!\n');
    
    const confirmation1 = await question('Type "DELETE ALL DATA" (exactly) to confirm: ');
    if (confirmation1 !== 'DELETE ALL DATA') {
      console.log('❌ Confirmation failed. Aborting for safety.');
      rl.close();
      process.exit(0);
    }

    const confirmation2 = await question('Type "YES I AM SURE" (exactly) to confirm again: ');
    if (confirmation2 !== 'YES I AM SURE') {
      console.log('❌ Second confirmation failed. Aborting for safety.');
      rl.close();
      process.exit(0);
    }

    rl.close();
    console.log('\n');

    // List of all collections to clear
    const collectionsToClear = [
      'users',
      'accounts',
      'positions',
      'daytrades',
      'portfoliotransactions',
      'expensetransactions',
      'categories',
      'cards',
      'financialgoals',
      'dashboardwidgets',
      'budgets',
      'notes',
      'portfoliosnapshots',
      'pagelayouts',
      'sharedusers'
    ];

    console.log('🧹 Clearing all collections...\n');

    for (const collectionName of collectionsToClear) {
      try {
        const collection = db.collection(collectionName);
        const count = await collection.countDocuments({});
        if (count > 0) {
          const result = await collection.deleteMany({});
          console.log(`✅ Cleared ${result.deletedCount} documents from ${collectionName}`);
        } else {
          console.log(`⏭️  Skipped ${collectionName} (already empty)`);
        }
      } catch (error) {
        // Collection might not exist, skip it
        console.log(`⚠️  Skipped ${collectionName} (collection might not exist)`);
      }
    }

    console.log('\n📊 Reset Summary:');
    console.log(`✅ Cleared ${collectionsToClear.length} collections`);
    console.log('\n✨ App has been reset successfully!');
    console.log('💡 You can now seed fresh data using: npm run seed:test-data');

  } catch (error) {
    console.error('❌ Error during reset:', error);
    throw error;
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
}

// Run the reset
resetApp()
  .then(() => {
    console.log('\n✨ Reset completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Reset failed:', error);
    process.exit(1);
  });
