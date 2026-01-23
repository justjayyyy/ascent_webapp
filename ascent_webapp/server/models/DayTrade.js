import mongoose from 'mongoose';

const dayTradeSchema = new mongoose.Schema({
  accountId: {
    type: String,
    required: true,
    index: true
  },
  symbol: {
    type: String,
    required: true
  },
  date: {
    type: String,
    required: true
  },
  entryPrice: {
    type: Number,
    required: true
  },
  exitPrice: {
    type: Number,
    required: true
  },
  quantity: {
    type: Number,
    required: true
  },
  profitLoss: {
    type: Number,
    required: true
  },
  side: {
    type: String,
    enum: ['long', 'short'],
    default: 'long'
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

dayTradeSchema.virtual('id').get(function() {
  return this._id.toHexString();
});

dayTradeSchema.set('toJSON', { virtuals: true });
dayTradeSchema.set('toObject', { virtuals: true });

export default mongoose.models.DayTrade || mongoose.model('DayTrade', dayTradeSchema);

