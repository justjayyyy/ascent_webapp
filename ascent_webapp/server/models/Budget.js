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
  period: {
    type: String,
    enum: ['weekly', 'monthly', 'yearly'],
    default: 'monthly'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  created_by: {
    type: String,
    required: true,
    index: true
  }
}, {
  timestamps: { createdAt: 'created_date', updatedAt: 'updated_date' }
});

budgetSchema.virtual('id').get(function() {
  return this._id.toHexString();
});

budgetSchema.set('toJSON', { virtuals: true });
budgetSchema.set('toObject', { virtuals: true });

export default mongoose.model('Budget', budgetSchema);

