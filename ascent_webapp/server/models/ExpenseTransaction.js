import mongoose from 'mongoose';

const expenseTransactionSchema = new mongoose.Schema({
  type: {
    type: String,
    required: true,
    enum: ['Income', 'Expense']
  },
  amount: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    default: 'USD'
  },
  category: {
    type: String,
    required: true
  },
  description: {
    type: String,
    default: ''
  },
  date: {
    type: String,
    required: true
  },
  paymentMethod: {
    type: String,
    default: ''
  },
  cardId: {
    type: String,
    default: null
  },
  isRecurring: {
    type: Boolean,
    default: false
  },
  recurringFrequency: {
    type: String,
    enum: ['daily', 'weekly', 'monthly', 'yearly', null],
    default: null
  },
  tags: [{
    type: String
  }],
  created_by: {
    type: String,
    required: true,
    index: true
  }
}, {
  timestamps: { createdAt: 'created_date', updatedAt: 'updated_date' }
});

expenseTransactionSchema.virtual('id').get(function() {
  return this._id.toHexString();
});

expenseTransactionSchema.set('toJSON', { virtuals: true });
expenseTransactionSchema.set('toObject', { virtuals: true });

export default mongoose.models.ExpenseTransaction || mongoose.model('ExpenseTransaction', expenseTransactionSchema);

