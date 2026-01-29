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
    enum: ['Stock', 'ETF', 'Bond', 'Crypto', 'Cash', 'Real Estate', 'Commodity', 'Option', 'Other']
  },
  strikePrice: {
    type: Number,
    default: null
  },
  expirationDate: {
    type: String,
    default: null
  },
  optionType: {
    type: String,
    enum: ['Call', 'Put'],
    default: null
  },
  optionAction: {
    type: String,
    enum: ['Buy', 'Sell'],
    default: null
  },
  premiumPrice: {
    type: Number,
    default: null
  },
  stockPriceAtPurchase: {
    type: Number,
    default: null
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

positionSchema.virtual('id').get(function() {
  return this._id.toHexString();
});

positionSchema.set('toJSON', { virtuals: true });
positionSchema.set('toObject', { virtuals: true });

export default mongoose.models.Position || mongoose.model('Position', positionSchema);

