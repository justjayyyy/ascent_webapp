import './limits.js';
import mongoose from 'mongoose';
import { addDedupeKey } from './dedupe.js';

// Delete cached model to allow schema changes
if (mongoose.models.Budget) {
  delete mongoose.models.Budget;
}

const budgetSchema = new mongoose.Schema({
  category: {
    type: String,
    required: true
  },
  monthlyLimit: {
    type: Number,
    required: true,
    // A budget of nothing, or less, measures nothing
    min: [0.01, 'The monthly limit must be above zero']
  },
  alertThreshold: {
    type: Number,
    default: 80,
    min: 1,
    max: 100
  },
  currency: {
    type: String,
    default: 'USD'
  },
  year: {
    type: Number,
    required: true,
    index: true
  },
  month: {
    type: Number,
    required: true,
    min: 1,
    max: 12,
    index: true
  },
  period: {
    type: String,
    enum: ['weekly', 'monthly', 'yearly'],
    default: 'monthly'
  },
  // Carries on into later months (see shared/budgets.js); budgets from before this only count in their month
  repeat: {
    type: Boolean,
    default: false
  },
  // The last month a repeating budget counts in, 'YYYY-MM'; empty while it goes on
  until: {
    type: String,
    default: null,
    validate: {
      validator: (v) => v == null || /^\d{4}-(0[1-9]|1[0-2])$/.test(v),
      message: 'until must be a month, YYYY-MM'
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isShared: {
    type: Boolean,
    default: true
  },
  workspaceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Workspace',
    required: true,
    index: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: { createdAt: 'created_date', updatedAt: 'updated_date' }
});

// Compound index for efficient queries by workspace, year, month, and category
budgetSchema.index({ workspaceId: 1, year: 1, month: 1, category: 1 });

budgetSchema.virtual('id').get(function() {
  return this._id.toHexString();
});

budgetSchema.set('toJSON', { virtuals: true });
budgetSchema.set('toObject', { virtuals: true });

addDedupeKey(budgetSchema);

export default mongoose.model('Budget', budgetSchema);

