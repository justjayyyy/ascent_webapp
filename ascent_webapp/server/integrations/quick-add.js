import crypto from 'crypto';
import connectDB from '../lib/mongodb.js';
import { handleCors } from '../lib/cors.js';
import { success, error, serverError, unauthorized, forbidden } from '../lib/response.js';
import { memberCanSubmit } from '../lib/ingest/access.js';
import { authMiddleware } from '../middleware/auth.js';
import { suggestCategory } from '../lib/categorize.js';
import { loadRules, ruleKeyFor } from '../lib/merchantRules.js';
import { categoryTranslations } from '../lib/categoryTranslations.js';
import User from '../models/User.js';
import Workspace from '../models/Workspace.js';
import Category from '../models/Category.js';
import Card from '../models/Card.js';
import ExpenseTransaction from '../models/ExpenseTransaction.js';

// Adds an expense from an Apple Pay tap. An iOS Shortcuts "Transaction" automation calls
// this with the merchant and amount, and the category is worked out here.
//
//   POST /api/integrations/quick-add   Authorization: Bearer ask_...   (the Shortcut)
//   GET | POST | DELETE (signed-in app) -> status / create a new key / revoke the key

const TOKEN_PREFIX = 'ask_';
const hash = (token) => crypto.createHash('sha256').update(token).digest('hex');

const CURRENCY_SYMBOLS = { '₪': 'ILS', '$': 'USD', '€': 'EUR', '£': 'GBP', '₽': 'RUB', '¥': 'JPY' };
const CURRENCY_CODES = ['ILS', 'USD', 'EUR', 'GBP', 'RUB', 'JPY', 'CAD', 'AUD', 'CHF', 'UAH', 'PLN', 'CZK'];

/** "₪1,234.50", "12,50 €", "USD 8" -> { amount, currency } */
export function parseMoney(value) {
  if (typeof value === 'number') return { amount: value, currency: null };
  const raw = String(value ?? '').trim();
  let currency = null;
  for (const [sym, code] of Object.entries(CURRENCY_SYMBOLS)) if (raw.includes(sym)) currency = code;
  const code = CURRENCY_CODES.find(c => new RegExp(`\\b${c}\\b`, 'i').test(raw));
  if (code) currency = code;
  let num = raw.replace(/[^\d.,-]/g, '');
  if (!num) return { amount: NaN, currency };
  const lastDot = num.lastIndexOf('.');
  const lastComma = num.lastIndexOf(',');
  if (lastDot !== -1 && lastComma !== -1) {
    // the later separator is the decimal point
    num = lastDot > lastComma ? num.replace(/,/g, '') : num.replace(/\./g, '').replace(',', '.');
  } else if (lastComma !== -1) {
    // "12,50" is a decimal comma; "1,234" is thousands
    num = /,\d{1,2}$/.test(num) ? num.replace(',', '.') : num.replace(/,/g, '');
  }
  return { amount: parseFloat(num), currency };
}

function todayIn(timeZone) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function bearer(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : (req.headers['x-api-key'] || '').toString().trim();
}

async function addFromShortcut(req, res, token) {
  const user = await User.findOne({ shortcutTokenHash: hash(token) });
  if (!user || !user.shortcutWorkspaceId) return unauthorized(res, 'Invalid key');

  // Checked on every use: someone removed from the household, or no longer allowed to add expenses,
  // cannot keep adding them with a key made earlier
  const workspace = await Workspace.findOne({
    _id: user.shortcutWorkspaceId,
    members: { $elemMatch: { userId: user._id, status: { $in: ['accepted', null] } } },
  }).select('members').lean();
  const member = workspace?.members?.find((m) => String(m.userId) === String(user._id));
  if (!memberCanSubmit(member)) return forbidden(res, 'This key can no longer add expenses to that workspace');

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const merchant = String(body.merchant ?? body.name ?? body.description ?? body.title ?? '').trim().slice(0, 120);
  const money = parseMoney(body.amount);
  if (!Number.isFinite(money.amount) || money.amount <= 0 || money.amount > 10_000_000) {
    return error(res, 'A positive amount is required', 400);
  }
  const currency = String(body.currency || money.currency || user.currency || 'USD').toUpperCase().slice(0, 3);
  const workspaceId = user.shortcutWorkspaceId;

  // A double-fired automation shouldn't record the purchase twice
  const recent = await ExpenseTransaction.findOne({
    workspaceId, createdBy: user._id, amount: money.amount, description: merchant || 'Apple Pay',
    created_date: { $gte: new Date(Date.now() - 90 * 1000) },
  }).lean();
  if (recent) {
    return success(res, { id: recent._id.toString(), duplicate: true, category: recent.category, message: 'Already added' });
  }

  const ruleKey = ruleKeyFor({ merchant });
  const [categories, history, cards, rules] = await Promise.all([
    Category.find({ workspaceId }).lean(),
    ExpenseTransaction.find({ workspaceId, type: 'Expense' }).sort('-date').limit(500).select('description category type').lean(),
    Card.find({ workspaceId, isActive: { $ne: false } }).lean(),
    ruleKey ? loadRules(workspaceId, [ruleKey]) : [],
  ]);

  const suggestion = merchant
    ? suggestCategory({ description: merchant, merchantKey: ruleKey, type: 'Expense', categories, history, rules })
    : null;
  const expenseCats = categories.filter(c => c.type === 'Expense' || c.type === 'Both');
  const fallback = expenseCats.find(c => (c.nameKey || c.name) === 'other_expense' || c.name === 'Other') || expenseCats[0];
  const category = suggestion?.name || fallback?.name || 'other_expense';

  // Match the card Wallet reports ("Visa •••• 1234", "Max") to one the user has added
  const cardText = String(body.card ?? '').toLowerCase();
  const card = cardText && cards.find(c =>
    (c.lastFourDigits && cardText.includes(c.lastFourDigits)) ||
    (c.name && cardText.includes(c.name.toLowerCase())));

  const timeZone = body.timezone || (user.currency === 'ILS' ? 'Asia/Jerusalem' : 'UTC');
  const date = /^\d{4}-\d{2}-\d{2}$/.test(body.date || '') ? body.date : todayIn(timeZone);
  const sameCurrency = currency === (user.currency || 'USD');

  const tx = await ExpenseTransaction.create({
    type: 'Expense',
    amount: money.amount,
    currency,
    amountInGlobalCurrency: sameCurrency ? money.amount : null,
    globalCurrency: sameCurrency ? currency : null,
    exchangeRate: sameCurrency ? 1 : null,
    category,
    description: merchant || 'Apple Pay',
    date,
    paymentMethod: 'Apple Pay',
    cardId: card ? card._id.toString() : null,
    tags: ['apple-pay'],
    source: 'wallet',
    workspaceId,
    createdBy: user._id,
    created_by: user.email,
  });

  await User.updateOne({ _id: user._id }, { $set: { shortcutLastUsedAt: new Date() } });

  const key = (expenseCats.find(c => c.name === category)?.nameKey) || category;
  const label = categoryTranslations[key]?.[user.language] || categoryTranslations[key]?.en || category;
  return success(res, {
    id: tx._id.toString(),
    merchant: tx.description,
    amount: tx.amount,
    currency,
    category,
    categoryLabel: label,
    matchedBy: suggestion?.source || 'default',
    card: card?.name || null,
    message: `${tx.description}: ${money.amount} ${currency} · ${label}`,
  }, 201);
}

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  try {
    await connectDB();

    // The Shortcut authenticates with its personal key instead of a sign-in session
    const token = bearer(req);
    if (token.startsWith(TOKEN_PREFIX)) {
      if (req.method !== 'POST') return error(res, 'Method not allowed', 405);
      return await addFromShortcut(req, res, token);
    }

    const user = await authMiddleware(req, res);
    if (!user) return;

    if (req.method === 'GET') {
      const u = await User.findById(user._id).lean();
      return success(res, {
        enabled: !!u.shortcutTokenHash,
        createdAt: u.shortcutCreatedAt,
        lastUsedAt: u.shortcutLastUsedAt,
        workspaceId: u.shortcutWorkspaceId,
      });
    }

    if (req.method === 'POST') {
      if (!req.workspace) return error(res, 'Workspace context required', 400);
      const key = TOKEN_PREFIX + crypto.randomBytes(24).toString('hex');
      await User.updateOne({ _id: user._id }, {
        $set: {
          shortcutTokenHash: hash(key),
          shortcutWorkspaceId: req.workspace._id,
          shortcutCreatedAt: new Date(),
          shortcutLastUsedAt: null,
        },
      });
      return success(res, { token: key, workspaceId: req.workspace._id }, 201);
    }

    if (req.method === 'DELETE') {
      await User.updateOne({ _id: user._id }, {
        $set: { shortcutWorkspaceId: null, shortcutCreatedAt: null, shortcutLastUsedAt: null },
        $unset: { shortcutTokenHash: 1 },
      });
      return success(res, { revoked: true });
    }

    return error(res, 'Method not allowed', 405);
  } catch (err) {
    return serverError(res, err);
  }
}
