import './limits.js';
import mongoose from 'mongoose';
import { installTransactionHooks } from '../lib/transactionHooks.js';

// One entry per automated report of a purchase (Wallet tap, SMS alert, statement row) that this row absorbed.
const ingestSourceSchema = new mongoose.Schema({
  source: { type: String, enum: ['wallet', 'sms', 'statement'], required: true },
  at: Date,
  tokenId: mongoose.Schema.Types.ObjectId,
  cardText: { type: String, maxlength: 80 },
  ref: String // statement imports: the replay key of the row that was merged in, so a re-import skips it
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
  globalCurrency: {
    type: String,
    default: null // the currency amountInGlobalCurrency is in (the saver's own currency at the time)
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
  // Shared by every row one monthly recurring save added, so the series can be edited or deleted together
  recurringGroupId: {
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

  // The months a payment is for, when not the month it was paid: a water bill for July–August paid in
  // October, property tax for two months paid ahead. 'YYYY-MM', both or neither (shared/homeCosts.js)
  coversFrom: {
    type: String,
    default: null,
    match: /^\d{4}-(0[1-9]|1[0-2])$/
  },
  coversTo: {
    type: String,
    default: null,
    match: /^\d{4}-(0[1-9]|1[0-2])$/,
    validate: {
      // At most two years, never before it starts
      validator(to) {
        const from = this.coversFrom ?? this.get?.('coversFrom');
        if (!to || !from) return true;
        const months = (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + Number(to.slice(5)) - Number(from.slice(5));
        return months >= 0 && months < 24;
      },
      message: 'coversTo must be within two years after coversFrom'
    }
  },
  // Big purchases: a one-off large expense, optionally paid in installments. Every installment is its
  // own row (so it lands in its month and budget) and shares installmentGroupId with its siblings.
  isBigPurchase: {
    type: Boolean,
    default: false
  },
  installmentGroupId: {
    type: String,
    default: null,
    index: true
  },
  installmentIndex: {
    type: Number,
    default: null // 1-based
  },
  installmentCount: {
    type: Number,
    default: null
  },
  installmentTotal: {
    type: Number,
    default: null // full price of the purchase, in the row's currency
  },

  // Money spent towards a Plan (a trip, a wedding...). planItemId is set when it pays a specific item.
  planId: {
    type: String,
    default: null,
    index: true
  },
  planItemId: {
    type: String,
    default: null
  },

  // A payment towards a loan or other commitment (see the Commitment model)
  commitmentId: {
    type: String,
    default: null,
    index: true
  },
  commitmentPaymentId: {
    type: String,
    default: null // set for an extra payment, so it is not taken for the month's scheduled one
  },

  // Households: who actually paid (an email, like created_by; empty means whoever added it)
  paidBy: {
    type: String,
    default: null
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
// The app's date windows (from/to) and the oldest-transaction lookup
expenseTransactionSchema.index({ workspaceId: 1, date: -1 });
expenseTransactionSchema.index(
  { workspaceId: 1, amount: 1, occurredAt: -1 },
  { partialFilterExpression: { occurredAt: { $type: 'date' } } }
);

installTransactionHooks(expenseTransactionSchema);

expenseTransactionSchema.virtual('id').get(function() {
  return this._id.toHexString();
});

expenseTransactionSchema.set('toJSON', { virtuals: true });
expenseTransactionSchema.set('toObject', { virtuals: true });

export default mongoose.models.ExpenseTransaction || mongoose.model('ExpenseTransaction', expenseTransactionSchema);

