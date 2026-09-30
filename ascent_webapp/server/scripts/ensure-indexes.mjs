// Creates the indexes the automation feature relies on (unique dedupeKey, inbox and match lookups, token hash, event TTL).
// Only ever adds indexes; nothing is dropped. Safe to re-run.
//
//   npm run ensure:indexes
//
// Run it once after deploying: the app does not depend on Mongoose creating indexes on its own.
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../lib/mongodb.js';
import ExpenseTransaction from '../models/ExpenseTransaction.js';
import IngestToken from '../models/IngestToken.js';
import IngestEvent from '../models/IngestEvent.js';

async function main() {
  await connectDB();
  for (const Model of [ExpenseTransaction, IngestToken, IngestEvent]) {
    await Model.createIndexes();
    const indexes = await Model.collection.indexes();
    console.log(`\n${Model.modelName} (${Model.collection.name})`);
    for (const ix of indexes) {
      const flags = [ix.unique && 'unique', ix.partialFilterExpression && 'partial', ix.expireAfterSeconds != null && `ttl=${ix.expireAfterSeconds}s`]
        .filter(Boolean)
        .join(', ');
      console.log(`  ${JSON.stringify(ix.key)}${flags ? `  [${flags}]` : ''}`);
    }
  }
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
