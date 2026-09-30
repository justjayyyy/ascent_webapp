// POST /api/import/statement   { rows: [{ date, description, amount, currency?, card?, category? }], review? }
// Adds a card or bank statement that was read on the device. Rows that match something already recorded
// are merged into it; the rest are added. `review: true` adds them as pending, for the review list.
import connectDB from '../lib/mongodb.js';
import { handleCors } from '../lib/cors.js';
import { success, error, forbidden, serverError } from '../lib/response.js';
import { authMiddleware } from '../middleware/auth.js';
import { memberMay } from '../lib/entityHandler.js';
import { suggestCategory } from '../lib/categorize.js';
import { learnRule, loadRules } from '../lib/merchantRules.js';
import { planStatementImport, MAX_ROWS } from '../lib/ingest/statement.js';
import { shiftDate } from '../lib/ingest/time.js';
import { WINDOWS } from '../lib/ingest/match.js';
import Category from '../models/Category.js';
import Card from '../models/Card.js';
import ExpenseTransaction from '../models/ExpenseTransaction.js';

const CANDIDATE_FIELDS = 'type amount currency occurredAt date status source cardId merchant merchantKey description ingest';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'POST') return error(res, 'Method not allowed', 405);

  try {
    const user = await authMiddleware(req, res);
    if (!user) return;
    if (!req.workspace) return error(res, 'Workspace context required', 400);
    if (!memberMay(req, user, 'editExpenses')) return forbidden(res, 'You do not have permission for this action');

    const rows = req.body?.rows;
    if (!Array.isArray(rows) || rows.length === 0) return error(res, 'rows_required', 400);
    if (rows.length > MAX_ROWS) return error(res, 'too_many_rows', 413);

    await connectDB();
    const workspaceId = req.workspace._id;
    const userCurrency = user.currency || 'USD';

    const dates = rows.map((r) => String(r?.date ?? '')).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
    if (!dates.length) return success(res, { created: 0, merged: 0, duplicates: 0, invalid: rows.length });
    const from = shiftDate(dates[0], -WINDOWS.statementDays);
    const to = shiftDate(dates.at(-1), WINDOWS.statementDays);

    const [existing, categories, cards, history, rules] = await Promise.all([
      ExpenseTransaction.find({ workspaceId, date: { $gte: from, $lte: to } }).select(`${CANDIDATE_FIELDS} dedupeKey`).lean(),
      Category.find({ workspaceId }).lean(),
      Card.find({ workspaceId }).select('lastFourDigits walletName name network isActive').lean(),
      ExpenseTransaction.find({ workspaceId }).sort('-date').limit(800).select('description category type').lean(),
      loadRules(workspaceId),
    ]);

    // Replay guard: keys of rows added by earlier imports, and of statement rows merged into other rows
    const seenKeys = new Set();
    existing.forEach((row) => {
      if (row.dedupeKey) seenKeys.add(row.dedupeKey);
      (row.ingest?.sources ?? []).forEach((s) => s.ref && seenKeys.add(s.ref));
    });

    const named = new Set(categories.map((c) => c.name));
    const fallback = (type) => {
      const usable = categories.filter((c) => c.type === type || c.type === 'Both');
      const other = type === 'Income' ? ['refunds', 'other_income'] : ['other_expense', 'Other'];
      return usable.find((c) => other.includes(c.nameKey || c.name))?.name || usable[0]?.name || other[0];
    };
    const chosen = [];
    const categorize = (row) => {
      // A category picked in the preview wins, and is remembered for that merchant
      if (row.category && named.has(row.category)) {
        chosen.push(row);
        return row.category;
      }
      return suggestCategory({ description: row.description, merchantKey: row.merchantKey, type: row.type, categories, history, rules })?.name || fallback(row.type);
    };

    const plan = planStatementImport({ rows, scope: `import:${workspaceId}`, userCurrency, existing, seenKeys, cards, categorize });
    const status = req.body.review === true ? 'pending' : 'confirmed';

    if (plan.creates.length) {
      await ExpenseTransaction.insertMany(
        plan.creates.map((doc) => ({ ...doc, status, workspaceId, createdBy: user._id, created_by: user.email })),
        { ordered: false }
      ).catch((err) => {
        // A key collision means a concurrent import already added that row; everything else still lands
        if (err?.code !== 11000 && !err?.writeErrors?.every((e) => e.code === 11000)) throw err;
      });
    }
    await Promise.all(plan.merges.map(({ id, set, entry }) => ExpenseTransaction.updateOne(
      { _id: id, workspaceId, 'ingest.sources.source': { $ne: 'statement' } },
      { $push: { 'ingest.sources': entry }, ...(Object.keys(set).length ? { $set: set } : {}) }
    )));

    const learned = new Map();
    chosen.forEach((r) => r.merchantKey && learned.set(`${r.type}|${r.merchantKey}`, r));
    await Promise.all([...learned.values()].map((r) => learnRule({ workspaceId, key: r.merchantKey, type: r.type, category: r.category, by: user.email })));

    return success(res, {
      created: plan.creates.length,
      merged: plan.merges.length,
      duplicates: plan.duplicates,
      invalid: plan.invalid,
      credits: plan.creates.filter((c) => c.type === 'Income').length,
    });
  } catch (err) {
    console.error('[ImportStatement] failed:', err?.message);
    return serverError(res, err);
  }
}
