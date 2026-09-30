// Smart help for the signed-in app.
//   GET  /api/assist                          -> { ai: { configured, enabled } }
//   POST /api/assist?action=suggest-category  { description, type } -> { name, source } | null
//   POST /api/assist?action=parse             { text }     -> a transaction draft      (AI, opt-in)
//   POST /api/assist?action=ask               { question } -> { answer }               (AI, opt-in)
// The AI actions only run when the workspace owner turned the assistant on in Settings.
import connectDB from '../lib/mongodb.js';
import { handleCors } from '../lib/cors.js';
import { success, error, forbidden, serverError } from '../lib/response.js';
import { authMiddleware } from '../middleware/auth.js';
import { memberMay } from '../lib/entityHandler.js';
import { suggestCategory } from '../lib/categorize.js';
import { categoryTranslations } from '../lib/categoryTranslations.js';
import { loadRules, ruleKeyFor } from '../lib/merchantRules.js';
import { spendingSummary } from '../lib/spendingSummary.js';
import { aiConfigured, parseNote, answerQuestion, AssistantDeclined } from '../lib/assistant.js';
import Category from '../models/Category.js';
import Card from '../models/Card.js';
import Budget from '../models/Budget.js';
import ExpenseTransaction from '../models/ExpenseTransaction.js';

const AI_LIMIT = { windowMs: 60 * 60_000, max: 40 }; // per person per hour
const aiCalls = new Map();

function aiRateLimited(userId) {
  const now = Date.now();
  const recent = (aiCalls.get(userId) || []).filter((t) => now - t < AI_LIMIT.windowMs);
  if (recent.length >= AI_LIMIT.max) return true;
  recent.push(now);
  aiCalls.set(userId, recent);
  return false;
}

// The device's own date ("yesterday" means the user's yesterday), trusted within a day of the server's
function localToday(given) {
  const utc = new Date().toISOString().slice(0, 10);
  if (typeof given !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(given)) return utc;
  return Math.abs(Date.parse(given) - Date.parse(utc)) <= 86_400_000 ? given : utc;
}

const labelsFor = (category) => {
  const key = category.nameKey || category.name;
  const tr = categoryTranslations[key];
  return tr ? [...new Set([category.name, tr.en, tr.he, tr.ru])] : [category.name];
};

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  try {
    const user = await authMiddleware(req, res);
    if (!user) return;
    if (!req.workspace) return error(res, 'Workspace context required', 400);
    await connectDB();

    const workspaceId = req.workspace._id;
    const aiEnabled = req.workspace.settings?.aiAssistant === true;
    const action = String(req.query.action || '');

    if (req.method === 'GET') {
      return success(res, { ai: { configured: aiConfigured(), enabled: aiEnabled } });
    }
    if (req.method !== 'POST') return error(res, 'Method not allowed', 405);
    const body = req.body || {};

    if (action === 'suggest-category') {
      if (!memberMay(req, user, 'editExpenses')) return forbidden(res, 'You do not have permission for this action');
      const description = String(body.description || '').slice(0, 200);
      const type = body.type === 'Income' ? 'Income' : 'Expense';
      const key = ruleKeyFor({ description });
      const [categories, history, rules] = await Promise.all([
        Category.find({ workspaceId }).lean(),
        ExpenseTransaction.find({ workspaceId, type }).sort('-date').limit(500).select('description category type').lean(),
        key ? loadRules(workspaceId, [key]) : [],
      ]);
      return success(res, suggestCategory({ description, merchantKey: key, type, categories, history, rules }));
    }

    if (action !== 'parse' && action !== 'ask') return error(res, 'unknown_action', 404);
    if (!aiConfigured()) return error(res, 'ai_not_configured', 503);
    if (!aiEnabled) return forbidden(res, 'ai_disabled');
    if (aiRateLimited(String(user._id))) return error(res, 'rate_limited', 429);
    const today = localToday(body.today);
    const currency = user.currency || 'USD';

    if (action === 'parse') {
      if (!memberMay(req, user, 'editExpenses')) return forbidden(res, 'You do not have permission for this action');
      const text = String(body.text || '').trim().slice(0, 300);
      if (!text) return error(res, 'text_required', 400);
      const [categories, cards] = await Promise.all([
        Category.find({ workspaceId }).lean(),
        Card.find({ workspaceId, isActive: { $ne: false } }).select('name').lean(),
      ]);
      const draft = await parseNote({
        text,
        today,
        currency,
        categories: categories.map((c) => ({ key: c.name, labels: labelsFor(c) })),
        cards: cards.map((c) => c.name).filter(Boolean),
      });
      // Only let through what the app can use as is
      const known = new Set(categories.map((c) => c.name));
      const card = draft.cardName && cards.find((c) => c.name === draft.cardName);
      return success(res, {
        ...draft,
        category: draft.category && known.has(draft.category) ? draft.category : null,
        currency: /^[A-Z]{3}$/.test(draft.currency || '') ? draft.currency : null,
        date: /^\d{4}-\d{2}-\d{2}$/.test(draft.date || '') && draft.date <= today ? draft.date : null,
        amount: draft.amount > 0 && draft.amount < 1e7 ? draft.amount : null,
        cardId: card ? String(card._id) : null,
        paymentMethod: card ? 'Card' : draft.paymentMethod,
      });
    }

    // ask
    if (!memberMay(req, user, 'viewExpenses')) return forbidden(res, 'You do not have permission for this action');
    const question = String(body.question || '').trim().slice(0, 500);
    if (!question) return error(res, 'question_required', 400);
    const [year, month] = today.split('-').map(Number);
    const since = `${year - 1}-${String(month).padStart(2, '0')}-01`;
    const [rows, budgets] = await Promise.all([
      ExpenseTransaction.find({ workspaceId, date: { $gte: since } })
        .select('type date amount currency amountInGlobalCurrency category description merchant merchantKey isRecurring installmentGroupId isBigPurchase planId')
        .lean(),
      memberMay(req, user, 'viewBudgets') ? Budget.find({ workspaceId, year, month }).lean() : [],
    ]);
    const inCurrency = (tx) => (tx.currency === currency ? tx.amount : tx.amountInGlobalCurrency);
    const language = ['he', 'ru'].includes(user.language) ? user.language : 'en';
    const summary = spendingSummary({
      transactions: rows.map((tx) => ({ ...tx, amount: inCurrency(tx) })).filter((tx) => typeof tx.amount === 'number'),
      budgets: budgets.map((b) => ({ category: b.category, limit: b.monthlyLimit })),
      today,
      currency,
      categoryName: (key) => categoryTranslations[key]?.[language] || key,
    });
    const answer = await answerQuestion({ question, summary, language });
    return success(res, { answer });
  } catch (err) {
    if (err instanceof AssistantDeclined) return error(res, 'ai_declined', 422);
    console.error('[Assist] failed:', err?.message);
    return serverError(res, err);
  }
}
