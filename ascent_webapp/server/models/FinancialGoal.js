import './limits.js';
import mongoose from 'mongoose';
import { addDedupeKey } from './dedupe.js';

// Money moved into a savings goal (a positive amount) or taken back out of it (negative).
const savingEntrySchema = new mongoose.Schema({
  id: { type: String, required: true },
  date: { type: String, required: true }, // yyyy-MM-dd
  amount: { type: Number, required: true },
  note: { type: String, default: '', maxlength: 500 },
  by: { type: String, default: '' } // email of the member who recorded it
}, { _id: false });

// A savings goal: money the household is putting aside for something, with or without a target.
// What is saved is `currentAmount` (already saved when the goal was set up) plus every entry.
const financialGoalSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    maxlength: 200
  },
  kind: {
    type: String,
    enum: ['emergency', 'vacation', 'home', 'car', 'education', 'wedding', 'baby', 'gadget', 'retirement', 'other'],
    default: 'other'
  },
  emoji: { type: String, default: '', maxlength: 16 },
  currency: { type: String, default: 'ILS' },
  // 0 means an open-ended pot with no target
  targetAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  currentAmount: {
    type: Number,
    default: 0
  },
  // What the household means to put aside each month, when it has decided
  monthlyAmount: { type: Number, default: 0, min: 0 },
  targetDate: {
    type: String,
    default: null
  },
  entries: [savingEntrySchema],
  status: { type: String, enum: ['active', 'done', 'archived'], default: 'active' },
  // Goals from before the Savings page; `kind` replaces it
  category: {
    type: String,
    enum: ['savings', 'investment', 'retirement', 'purchase', 'emergency', 'other'],
    default: 'savings'
  },
  linkedAccountIds: [{
    type: String
  }],
  notes: {
    type: String,
    default: '',
    maxlength: 5000
  },
  isCompleted: {
    type: Boolean,
    default: false
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
  created_by: { type: String }
}, {
  timestamps: { createdAt: 'created_date', updatedAt: 'updated_date' }
});

financialGoalSchema.virtual('id').get(function() {
  return this._id.toHexString();
});

financialGoalSchema.set('toJSON', { virtuals: true });
financialGoalSchema.set('toObject', { virtuals: true });

addDedupeKey(financialGoalSchema);

export default mongoose.models.FinancialGoal || mongoose.model('FinancialGoal', financialGoalSchema);
