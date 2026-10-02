// Creates the indexes the app relies on (unique dedupeKey, inbox and match lookups, token hash, event TTL,
// one copy of each default category per workspace). Only ever adds indexes; nothing is dropped. Safe to re-run.
//
//   npm run ensure:indexes
//   npm run ensure:indexes -- --fix-duplicate-categories   (first removes default categories seeded twice)
//
// Run it once after deploying: the app does not depend on Mongoose creating indexes on its own.
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../lib/mongodb.js';
import ExpenseTransaction from '../models/ExpenseTransaction.js';
import IngestToken from '../models/IngestToken.js';
import CalendarLink from '../models/CalendarLink.js';
import IngestEvent from '../models/IngestEvent.js';
import Category from '../models/Category.js';
import Workspace from '../models/Workspace.js';
import User from '../models/User.js';
import RateLimit from '../models/RateLimit.js';
import Budget from '../models/Budget.js';
import Plan from '../models/Plan.js';
import Commitment from '../models/Commitment.js';
import Settlement from '../models/Settlement.js';

// Older versions could seed the default categories twice when two screens loaded at once. Transactions
// refer to categories by name, so dropping the later copy loses nothing.
async function duplicateDefaultCategories() {
  const groups = await Category.aggregate([
    { $match: { isDefault: true, nameKey: { $type: 'string' } } },
    { $sort: { created_date: 1 } },
    { $group: { _id: { w: '$workspaceId', k: '$nameKey' }, ids: { $push: '$_id' }, n: { $sum: 1 } } },
    { $match: { n: { $gt: 1 } } },
  ]);
  return groups.flatMap((g) => g.ids.slice(1));
}

async function main() {
  await connectDB();
  const extra = await duplicateDefaultCategories();
  if (extra.length) {
    if (!process.argv.includes('--fix-duplicate-categories')) {
      throw new Error(`${extra.length} duplicate default categories exist; re-run with --fix-duplicate-categories`);
    }
    await Category.deleteMany({ _id: { $in: extra } });
    console.log(`Removed ${extra.length} duplicate default categories`);
  }
  for (const Model of [ExpenseTransaction, IngestToken, IngestEvent, Category, Workspace, User, RateLimit, Budget, Plan, Commitment, Settlement, CalendarLink]) {
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
