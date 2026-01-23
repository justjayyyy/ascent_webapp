import mongoose from 'mongoose';

const portfolioSnapshotSchema = new mongoose.Schema({
  date: {
    type: String,
    required: true
  },
  totalValue: {
    type: Number,
    required: true
  },
  totalCostBasis: {
    type: Number,
    default: 0
  },
  totalPnL: {
    type: Number,
    default: 0
  },
  accountBreakdown: [{
    accountId: String,
    accountName: String,
    value: Number
  }],
  assetBreakdown: [{
    assetType: String,
    value: Number
  }],
  created_by: {
    type: String,
    required: true,
    index: true
  }
}, {
  timestamps: { createdAt: 'created_date', updatedAt: 'updated_date' }
});

portfolioSnapshotSchema.virtual('id').get(function() {
  return this._id.toHexString();
});

portfolioSnapshotSchema.set('toJSON', { virtuals: true });
portfolioSnapshotSchema.set('toObject', { virtuals: true });

export default mongoose.models.PortfolioSnapshot || mongoose.model('PortfolioSnapshot', portfolioSnapshotSchema);

