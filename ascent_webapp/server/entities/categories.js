import Category from '../models/Category.js';
import connectDB from '../lib/mongodb.js';
import { handleCors } from '../lib/cors.js';
import { success, error, serverError } from '../lib/response.js';
import { authMiddleware } from '../middleware/auth.js';

// Default categories with translation keys and colors
const DEFAULT_CATEGORIES = [
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

// Create default categories for a workspace
async function createDefaultCategories(workspaceId, userId) {
  const categories = DEFAULT_CATEGORIES.map(cat => ({
    name: cat.nameKey, // Store the key as name, frontend will translate
    nameKey: cat.nameKey,
    type: cat.type,
    icon: cat.icon,
    color: cat.color,
    isDefault: true,
    workspaceId: workspaceId,
    createdBy: userId,
  }));
  
  await Category.insertMany(categories);
  return Category.find({ workspaceId }).sort('-created_date');
}

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  try {
    const user = await authMiddleware(req, res);
    if (!user) return;

    await connectDB();

    // Ensure workspace context
    if (!req.workspace) {
      return error(res, 'Workspace context required', 400);
    }

    const { method } = req;
    const { id } = req.query;

    // Filter by workspace
    const baseFilter = { workspaceId: req.workspace._id };

    switch (method) {
      case 'GET': {
        // Check if workspace has any categories
        let categories = await Category.find(baseFilter).sort('-created_date');
        
        // If no categories, create defaults
        if (categories.length === 0) {
          categories = await createDefaultCategories(req.workspace._id, user._id);
        }
        
        return success(res, categories);
      }

      case 'POST': {
        // Create new category
        const category = await Category.create({
          ...req.body,
          isDefault: false, // User-created categories are not default
          workspaceId: req.workspace._id,
          createdBy: user._id
        });
        return success(res, category, 201);
      }

      case 'PUT':
      case 'PATCH': {
        if (!id) {
          return error(res, 'ID is required for update');
        }

        const category = await Category.findOneAndUpdate(
          { _id: id, ...baseFilter },
          req.body,
          { new: true }
        );

        if (!category) {
          return error(res, 'Category not found', 404);
        }

        return success(res, category);
      }

      case 'DELETE': {
        if (!id) {
          return error(res, 'ID is required for delete');
        }

        const category = await Category.findOneAndDelete({ _id: id, ...baseFilter });

        if (!category) {
          return error(res, 'Category not found', 404);
        }

        return success(res, { deleted: true });
      }

      default:
        return error(res, 'Method not allowed', 405);
    }
  } catch (err) {
    console.error('[Categories API Error]', err);
    return serverError(res, err);
  }
}
