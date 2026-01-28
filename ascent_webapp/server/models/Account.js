import mongoose from 'mongoose';

const accountSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  type: {
    type: String,
    required: true,
    enum: ['Investment', 'Brokerage', 'IRA', 'Roth IRA', '401k', 'Pension', 'Savings', 'Crypto', 'Other']
  },
  baseCurrency: {
    type: String,
    default: 'USD'
  },
  institution: {
    type: String,
    default: ''
  },
  notes: {
    type: String,
    default: ''
  },
  initialInvestment: {
    type: Number,
    default: 0
  },
  created_by: {
    type: String,
    required: true,
    index: true,
    lowercase: true,
    trim: true
  }
}, {
  timestamps: { createdAt: 'created_date', updatedAt: 'updated_date' }
});

// Virtual for id
accountSchema.virtual('id').get(function() {
  return this._id.toHexString();
});

accountSchema.set('toJSON', { virtuals: true });
accountSchema.set('toObject', { virtuals: true });

export default mongoose.models.Account || mongoose.model('Account', accountSchema);

