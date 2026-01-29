import mongoose from 'mongoose';

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
    required: true
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
  isActive: {
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

export default mongoose.model('Budget', budgetSchema);

