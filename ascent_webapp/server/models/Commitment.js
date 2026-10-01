import './limits.js';
import mongoose from 'mongoose';

// A payment recorded against a commitment: an extra payment towards a loan (straight to the
// principal), or a repayment of a flexible one (money lent to or borrowed from family).
const commitmentPaymentSchema = new mongoose.Schema({
  id: { type: String, required: true },
  date: { type: String, required: true }, // yyyy-MM-dd
  amount: { type: Number, required: true, min: 0 },
  note: { type: String, default: '', maxlength: 500 },
  recordedAsExpense: { type: Boolean, default: false } // also added to Expenses when it was recorded
}, { _id: false });

// A loan, mortgage, lease or other money owed over time, or money the household lent out.
// With a monthly payment (or a term to derive it from) it follows a payment schedule; without one it
// is flexible and its balance is the amount minus the payments recorded. See shared/commitments.js.
const commitmentSchema = new mongoose.Schema({
  name: { type: String, required: true, maxlength: 200 },
  kind: {
    type: String,
    enum: ['mortgage', 'car', 'personal', 'student', 'credit', 'lease', 'family', 'other'],
    default: 'personal'
  },
  direction: { type: String, enum: ['borrowed', 'lent'], default: 'borrowed' },
  lender: { type: String, default: '', maxlength: 200 }, // the bank, or who lent / borrowed it
  emoji: { type: String, default: '', maxlength: 16 },
  currency: { type: String, default: 'ILS' },
  principal: { type: Number, required: true, min: 0 },
  annualRate: { type: Number, default: 0, min: 0, max: 100 }, // percent a year
  termMonths: { type: Number, default: null, min: 0, max: 600 },
  payment: { type: Number, default: null, min: 0 }, // fixed monthly payment, when known
  firstPaymentDate: { type: String, default: null }, // yyyy-MM-dd; later payments fall on the same day
  category: { type: String, default: '' }, // expense category for payments recorded in Expenses
  payments: [commitmentPaymentSchema],
  notes: { type: String, default: '', maxlength: 5000 },
  status: { type: String, enum: ['active', 'closed'], default: 'active' },
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
  created_by: { type: String }
}, {
  timestamps: { createdAt: 'created_date', updatedAt: 'updated_date' }
});

commitmentSchema.virtual('id').get(function() {
  return this._id.toHexString();
});

commitmentSchema.set('toJSON', { virtuals: true });
commitmentSchema.set('toObject', { virtuals: true });

export default mongoose.models.Commitment || mongoose.model('Commitment', commitmentSchema);
