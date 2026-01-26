import 'dotenv/config';
import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI;

// Demo users to keep
const DEMO_USERS = ['demo@ascent.com', 'demo-he@ascent.com'];

async function cleanupAllExceptDemo() {
  console.log('🚀 Connecting to MongoDB...');
  await mongoose.connect(MONGODB_URI);
  console.log('✅ Connected!\n');

  const db = mongoose.connection.db;

  console.log('⚠️  WARNING: This will delete ALL data except demo user data!');
  console.log(`📧 Keeping data for: ${DEMO_USERS.join(', ')}\n`);

  try {
    // Get all users except demo users
    const allUsers = await db.collection('users').find({}).toArray();
    const nonDemoUsers = allUsers.filter(u => !DEMO_USERS.includes(u.email));
    const nonDemoEmails = nonDemoUsers.map(u => u.email);
    
    console.log(`👥 Found ${nonDemoUsers.length} non-demo users to delete`);
    console.log(`📧 Demo users to keep: ${DEMO_USERS.length}\n`);

    // Delete users (except demo users)
    if (nonDemoEmails.length > 0) {
      const userResult = await db.collection('users').deleteMany({ 
        email: { $nin: DEMO_USERS } 
      });
      console.log(`✅ Deleted ${userResult.deletedCount} users`);
    }

    // Delete all data not created by demo users
    const collectionsToClean = [
      'accounts',
      'positions',
      'daytrades',
      'expensetransactions',
      'categories',
      'cards',
      'financialgoals',
      'dashboardwidgets',
      'budgets',
      'notes',
      'portfoliosnapshots',
      'pagelayouts'
    ];

    for (const collectionName of collectionsToClean) {
      try {
        const collection = db.collection(collectionName);
        const result = await collection.deleteMany({
          created_by: { $nin: DEMO_USERS }
        });
        console.log(`✅ Deleted ${result.deletedCount} documents from ${collectionName}`);
      } catch (error) {
        // Collection might not exist, skip it
        console.log(`⚠️  Skipped ${collectionName} (collection might not exist)`);
      }
    }

    // Handle SharedUser collection (check both created_by and invitedEmail)
    try {
      const sharedUserResult = await db.collection('sharedusers').deleteMany({
        $and: [
          { created_by: { $nin: DEMO_USERS } },
          { invitedEmail: { $nin: DEMO_USERS } }
        ]
      });
      console.log(`✅ Deleted ${sharedUserResult.deletedCount} shared user records`);
    } catch (error) {
      console.log(`⚠️  Skipped sharedusers (collection might not exist)`);
    }

    // Summary
    console.log('\n📊 Cleanup Summary:');
    console.log(`✅ Kept ${DEMO_USERS.length} demo users`);
    console.log(`✅ Deleted ${nonDemoUsers.length} non-demo users`);
    console.log(`✅ Cleaned all collections except demo user data\n`);

    // Verify demo users still exist
    const remainingUsers = await db.collection('users').find({}).toArray();
    console.log('👥 Remaining users:');
    remainingUsers.forEach(user => {
      console.log(`   - ${user.email} (${user.full_name || 'No name'})`);
    });

  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    throw error;
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
}

// Run the cleanup
cleanupAllExceptDemo()
  .then(() => {
    console.log('\n✨ Cleanup completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Cleanup failed:', error);
    process.exit(1);
  });
