import mongoose from 'mongoose';

// One entry per automated report of a purchase (Wallet tap, SMS alert, statement row) that this row absorbed.
const ingestSourceSchema = new mongoose.Schema({
  source: { type: String, enum: ['wallet', 'sms', 'statement'], required: true },
  at: Date,
  tokenId: mongoose.Schema.Types.ObjectId,
  cardText: { type: String, maxlength: 80 }
}, { _id: false });

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
  },
  // The UI shows who added a row from this email (author avatar, person filter). Rows created before
  // this field existed can be filled in with server/scripts/backfill-ingest-fields.mjs.
  created_by: {
    type: String
  },

  // Automation (Apple Wallet taps, later SMS alerts and statements). All optional: rows written before
  // these existed have no status and count as confirmed, so read them with `status !== 'pending'`.
  status: {
    type: String,
    enum: ['confirmed', 'pending'],
    default: 'confirmed'
  },
  source: {
    type: String,
    enum: ['manual', 'wallet', 'sms', 'statement'],
    default: 'manual'
  },
  merchant: {
    type: String,
    default: '',
    maxlength: 120
  },
  merchantKey: {
    type: String,
    default: ''
  },
  occurredAt: {
    type: Date,
    default: null // best estimate of the purchase instant; only set on automated rows
  },
  dedupeKey: {
    type: String // exact-replay guard, see the partial unique index below
  },
  ingest: {
    sources: {
      type: [ingestSourceSchema],
      default: undefined
    },
    flags: {
      type: [String], // incomplete, currencyAssumed, signNegative, dateApprox, possibleDuplicate
      default: undefined
    },
    duplicateOf: {
      type: mongoose.Schema.Types.ObjectId
    }
  }
}, {
  timestamps: { createdAt: 'created_date', updatedAt: 'updated_date' }
});

// Partial, not sparse: workspaceId is on every row, so a sparse compound index would still index all of them
// and every manual row (no dedupeKey) would collide with the next.
expenseTransactionSchema.index(
  { workspaceId: 1, dedupeKey: 1 },
  { unique: true, partialFilterExpression: { dedupeKey: { $type: 'string' } } }
);
expenseTransactionSchema.index({ workspaceId: 1, status: 1, date: -1 });
expenseTransactionSchema.index(
  { workspaceId: 1, amount: 1, occurredAt: -1 },
  { partialFilterExpression: { occurredAt: { $type: 'date' } } }
);

expenseTransactionSchema.virtual('id').get(function() {
  return this._id.toHexString();
});

expenseTransactionSchema.set('toJSON', { virtuals: true });
expenseTransactionSchema.set('toObject', { virtuals: true });

export default mongoose.models.ExpenseTransaction || mongoose.model('ExpenseTransaction', expenseTransactionSchema);

