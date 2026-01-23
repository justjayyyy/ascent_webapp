import mongoose from 'mongoose';

const positionSchema = new mongoose.Schema({
  accountId: {
    type: String,
    required: true,
    index: true
  },
  symbol: {
    type: String,
    required: true
  },
  assetType: {
    type: String,
    required: true,
    enum: ['Stock', 'ETF', 'Bond', 'Crypto', 'Cash', 'Real Estate', 'Commodity', 'Other']
  },
  quantity: {
    type: Number,
    required: true
  },
  averageBuyPrice: {
    type: Number,
    required: true
  },
  currentPrice: {
    type: Number,
    default: null
  },
  currency: {
    type: String,
    default: 'USD'
  },
  date: {
    type: String,
    required: true
  },
  lastPriceUpdate: {
    type: Date,
    default: null
  },
  notes: {
    type: String,
    default: ''
  },
  created_by: {
    type: String,
    required: true,
    index: true
  }
}, {
  timestamps: { createdAt: 'created_date', updatedAt: 'updated_date' }
});

positionSchema.virtual('id').get(function() {
  return this._id.toHexString();
});

positionSchema.set('toJSON', { virtuals: true });
positionSchema.set('toObject', { virtuals: true });

export default mongoose.models.Position || mongoose.model('Position', positionSchema);

