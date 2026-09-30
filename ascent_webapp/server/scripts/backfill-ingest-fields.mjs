// One-off cleanup for rows written before the automation feature:
//   1. status / source: rows without them become status "confirmed", source "manual"
//   2. created_by: the UI shows who added a row from this email, but API-created rows only carry the createdBy user id
//
// Dry run by default: it only counts. Pass --apply to write.
//
//   node --env-file=.env server/scripts/backfill-ingest-fields.mjs            (report only)
//   node --env-file=.env server/scripts/backfill-ingest-fields.mjs --apply
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../lib/mongodb.js';
import ExpenseTransaction from '../models/ExpenseTransaction.js';
import User from '../models/User.js';

const apply = process.argv.includes('--apply');

async function main() {
  await connectDB();
  const rows = ExpenseTransaction.collection;

  const needStatus = { status: { $exists: false } };
  const statusCount = await rows.countDocuments(needStatus);
  console.log(`Rows without status/source: ${statusCount}`);
  if (apply && statusCount) {
    const r = await rows.updateMany(needStatus, { $set: { status: 'confirmed', source: 'manual' } });
    console.log(`  updated ${r.modifiedCount}`);
  }

  const needAuthor = { created_by: { $exists: false }, createdBy: { $type: 'objectId' } };
  const authorCount = await rows.countDocuments(needAuthor);
  console.log(`Rows without created_by that have a createdBy user id: ${authorCount}`);
  if (authorCount) {
    const ids = await rows.distinct('createdBy', needAuthor);
    const users = await User.find({ _id: { $in: ids } }).select('email').lean();
    console.log(`  resolving ${ids.length} distinct users, ${users.length} found`);
    if (apply) {
      let updated = 0;
      for (const u of users) {
        const r = await rows.updateMany({ ...needAuthor, createdBy: u._id }, { $set: { created_by: u.email } });
        updated += r.modifiedCount;
      }
      console.log(`  updated ${updated}`);
    }
  }

  console.log(apply ? '\nDone.' : '\nDry run only. Re-run with --apply to write these changes.');
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
