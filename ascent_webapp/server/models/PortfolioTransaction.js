import mongoose from 'mongoose';

const portfolioTransactionSchema = new mongoose.Schema({
  accountId: {
    type: String,
    required: true,
    index: true
  },
  type: {
    type: String,
    required: true,
    enum: ['buy', 'sell', 'deposit', 'withdrawal']
  },
  symbol: {
    type: String,
    default: null // null for deposit/withdrawal
  },
  assetType: {
    type: String,
    default: null
  },
  quantity: {
    type: Number,
    required: true
  },
  pricePerUnit: {
    type: Number,
    default: 1 // 1 for cash transactions
  },
  totalAmount: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    default: 'USD'
  },
  date: {
    type: String,
    required: true
  },
  notes: {
    type: String,
    default: ''
  },
  // Reference to the position (if applicable)
  positionId: {
    type: String,
    default: null
  },
  created_by: {
    type: String,
    required: true,
    index: true
  }
}, {
  timestamps: { createdAt: 'created_date', updatedAt: 'updated_date' }
});

portfolioTransactionSchema.virtual('id').get(function() {
  return this._id.toHexString();
});

portfolioTransactionSchema.set('toJSON', { virtuals: true });
portfolioTransactionSchema.set('toObject', { virtuals: true });

export default mongoose.models.PortfolioTransaction || mongoose.model('PortfolioTransaction', portfolioTransactionSchema);
