import MerchantRule from '../models/MerchantRule.js';
import { merchantKey } from './ingest/text.js';

/** The key a transaction is remembered by: the stored merchant key, else one made from its text. */
export function ruleKeyFor(tx) {
  if (tx?.merchantKey) return tx.merchantKey;
  const key = merchantKey(tx?.merchant || tx?.description || '');
  return key.length >= 2 ? key : '';
}

/**
 * Remember the category someone chose for a merchant. Choosing the same one again strengthens the rule;
 * choosing another replaces it. Never throws: learning must not break the save that triggered it.
 */
export async function learnRule({ workspaceId, key, type = 'Expense', category, by }) {
  if (!workspaceId || !key || !category) return;
  try {
    const existing = await MerchantRule.findOne({ workspaceId, merchantKey: key, type }).lean();
    if (existing?.category === category) {
      await MerchantRule.updateOne({ _id: existing._id }, { $inc: { hits: 1 }, $set: { updatedBy: by } });
    } else {
      await MerchantRule.updateOne(
        { workspaceId, merchantKey: key, type },
        { $set: { category, hits: 1, updatedBy: by } },
        { upsert: true }
      );
    }
  } catch (err) {
    if (err?.code !== 11000) console.error('[MerchantRules] learn failed:', err?.message);
  }
}

/** Rules for the given keys (or all of the workspace's when no keys are given). */
export async function loadRules(workspaceId, keys) {
  try {
    const filter = { workspaceId };
    if (keys) filter.merchantKey = { $in: keys.filter(Boolean) };
    return await MerchantRule.find(filter).select('merchantKey type category hits').lean();
  } catch (err) {
    console.error('[MerchantRules] load failed:', err?.message);
    return [];
  }
}
