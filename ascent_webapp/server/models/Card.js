import mongoose from 'mongoose';

const cardSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  lastFourDigits: {
    type: String,
    default: ''
  },
  type: {
    type: String,
    enum: ['credit', 'debit', 'prepaid'],
    default: 'credit'
  },
  network: {
    type: String,
    enum: ['visa', 'mastercard', 'amex', 'discover', 'other'],
    default: 'visa'
  },
  color: {
    type: String,
    default: '#5C8374'
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

cardSchema.virtual('id').get(function() {
  return this._id.toHexString();
});

cardSchema.set('toJSON', { virtuals: true });
cardSchema.set('toObject', { virtuals: true });

export default mongoose.models.Card || mongoose.model('Card', cardSchema);

