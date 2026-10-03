import Category from '../models/Category.js';
import connectDB from '../lib/mongodb.js';
import { handleCors } from '../lib/cors.js';
import { success, error, notFound, forbidden, serverError } from '../lib/response.js';
import { authMiddleware } from '../middleware/auth.js';
import { memberMay, toPlain } from '../lib/entityHandler.js';
import { isValidObjectId } from '../lib/validate.js';
import { categoryTranslations } from '../lib/categoryTranslations.js';

// Every name a category goes by, lowercased: as stored (a default is stored by its key) and in each language
function namesOf(name) {
  const n = String(name || '').trim();
  const t = categoryTranslations[n] || Object.values(categoryTranslations).find((tr) => Object.values(tr).some((v) => v.toLowerCase() === n.toLowerCase()));
  return new Set([n, ...(t ? Object.values(t) : [])].map((v) => v.toLowerCase()));
}

// Default categories with translation keys and colors
export const DEFAULT_CATEGORIES = [
  // Expense categories
  { nameKey: 'food_dining', type: 'Expense', icon: '🍽️', color: '#EF4444' },
  { nameKey: 'groceries', type: 'Expense', icon: '🛒', color: '#F59E0B' },
  { nameKey: 'transportation', type: 'Expense', icon: '🚗', color: '#3B82F6' },
  { nameKey: 'utilities', type: 'Expense', icon: '💡', color: '#8B5CF6' },
  { nameKey: 'rent_housing', type: 'Expense', icon: '🏠', color: '#EC4899' },
  { nameKey: 'healthcare', type: 'Expense', icon: '🏥', color: '#10B981' },
  { nameKey: 'entertainment', type: 'Expense', icon: '🎬', color: '#F97316' },
  { nameKey: 'shopping', type: 'Expense', icon: '🛍️', color: '#06B6D4' },
  { nameKey: 'insurance', type: 'Expense', icon: '🛡️', color: '#6366F1' },
  { nameKey: 'education', type: 'Expense', icon: '📚', color: '#14B8A6' },
  { nameKey: 'personal_care', type: 'Expense', icon: '💅', color: '#D946EF' },
  { nameKey: 'subscriptions', type: 'Expense', icon: '📱', color: '#0EA5E9' },
  { nameKey: 'travel', type: 'Expense', icon: '✈️', color: '#22C55E' },
  { nameKey: 'gifts', type: 'Expense', icon: '🎁', color: '#E11D48' },
  { nameKey: 'taxes', type: 'Expense', icon: '📋', color: '#64748B' },
  { nameKey: 'other_expense', type: 'Expense', icon: '📦', color: '#78716C' },
  
  // Income categories
  { nameKey: 'salary', type: 'Income', icon: '💰', color: '#22C55E' },
  { nameKey: 'freelance', type: 'Income', icon: '💻', color: '#3B82F6' },
  { nameKey: 'investments', type: 'Income', icon: '📈', color: '#10B981' },
  { nameKey: 'rental_income', type: 'Income', icon: '🏢', color: '#8B5CF6' },
  { nameKey: 'gifts_received', type: 'Income', icon: '🎁', color: '#EC4899' },
  { nameKey: 'refunds', type: 'Income', icon: '↩️', color: '#06B6D4' },
  { nameKey: 'other_income', type: 'Income', icon: '💵', color: '#78716C' },
];

// Seeds the defaults once. Upserts on (workspace, nameKey) plus the unique index on the model mean two
// first loads arriving together cannot add every default twice.
export async function ensureDefaultCategories(workspaceId, userId) {
  try {
    await Category.bulkWrite(DEFAULT_CATEGORIES.map((cat) => ({
      updateOne: {
        filter: { workspaceId, nameKey: cat.nameKey, isDefault: true },
        update: {
          $setOnInsert: {
            name: cat.nameKey, // the key is stored as the name; the app translates it
            nameKey: cat.nameKey,
            type: cat.type,
            icon: cat.icon,
            color: cat.color,
            isDefault: true,
            workspaceId,
            createdBy: userId,
          },
        },
        upsert: true,
      },
    })), { ordered: false });
  } catch (err) {
    if (!isDuplicate(err)) throw err; // a concurrent seed won the race for some rows: fine
  }
}

const isDuplicate = (err) => err?.code === 11000 || err?.writeErrors?.every?.((e) => e.code === 11000 || e.err?.code === 11000);
const clean = (b) => Object.fromEntries(Object.entries(b || {}).filter(([k]) => !['workspaceId', 'createdBy', '_id', 'id', 'isDefault'].includes(k) && !k.startsWith('$')));

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  try {
    const user = await authMiddleware(req, res);
    if (!user) return;
    if (!req.workspace) return error(res, 'Workspace context required', 400);

    const { method } = req;
    // Same rule as the generic entity handler
    if (!memberMay(req, user, method === 'GET' ? 'viewExpenses' : 'editExpenses')) {
      return forbidden(res, 'You do not have permission for this action');
    }
    const id = req.query.id;
    if (id !== undefined && !isValidObjectId(id)) return error(res, 'Invalid id', 400);

    await connectDB();
    const scope = { workspaceId: req.workspace._id };

    switch (method) {
      case 'GET': {
        let categories = await Category.find(scope).sort('-created_date').lean();
        if (categories.length === 0) {
          await ensureDefaultCategories(req.workspace._id, user._id);
          categories = await Category.find(scope).sort('-created_date').lean();
        }
        return success(res, categories.map(toPlain));
      }

      case 'POST': {
        // The same category twice (two phones adding it at once, or a default typed as it is shown) is refused
        const wanted = namesOf(req.body?.name);
        const existing = await Category.find(scope).select('name').lean();
        if (existing.some((c) => [...namesOf(c.name)].some((n) => wanted.has(n)))) return error(res, 'Category already exists', 409);
        const category = await Category.create({ ...clean(req.body), isDefault: false, ...scope, createdBy: user._id });
        return success(res, toPlain(category), 201);
      }

      case 'PUT':
      case 'PATCH': {
        if (!id) return error(res, 'ID is required for update');
        const category = await Category.findOneAndUpdate({ _id: id, ...scope }, clean(req.body), { new: true, runValidators: true }).lean();
        return category ? success(res, toPlain(category)) : notFound(res, 'Category not found');
      }

      case 'DELETE': {
        if (!id) return error(res, 'ID is required for delete');
        const category = await Category.findOneAndDelete({ _id: id, ...scope }).lean();
        return category ? success(res, { deleted: true }) : notFound(res, 'Category not found');
      }

      default:
        return error(res, 'Method not allowed', 405);
    }
  } catch (err) {
    if (err?.name === 'ValidationError' || err?.name === 'CastError') return error(res, err.message, 400);
    console.error('[Categories API]', err?.message);
    return serverError(res, err);
  }
}
