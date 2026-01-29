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
  amountInGlobalCurrency: {
    type: Number,
    default: null // Will be set to amount if currency matches global currency, or converted amount if different
  },
  exchangeRate: {
    type: Number,
    default: null // Store the exchange rate used at transaction time for reference
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
  recurringStartDate: {
    type: String,
    default: null
  },
  recurringEndDate: {
    type: String,
    default: null
  },
  relatedAccountId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Account',
    default: null
  },
  tags: [{
    type: String
  }],
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

expenseTransactionSchema.virtual('id').get(function() {
  return this._id.toHexString();
});

expenseTransactionSchema.set('toJSON', { virtuals: true });
expenseTransactionSchema.set('toObject', { virtuals: true });

export default mongoose.models.ExpenseTransaction || mongoose.model('ExpenseTransaction', expenseTransactionSchema);

