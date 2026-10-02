import './limits.js';
import mongoose from 'mongoose';
import { addDedupeKey } from './dedupe.js';

export const TASK_KINDS = ['car', 'insurance', 'home', 'tax', 'health', 'documents', 'kids', 'pets', 'bill', 'other'];
export const TASK_REPEATS = ['none', 'monthly', 'bimonthly', 'quarterly', 'halfYearly', 'yearly'];

// One time the task was done: when, for which due date, what it cost and whether that went in as an expense
const doneSchema = new mongoose.Schema({
  id: { type: String, required: true },
  date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  dueDate: { type: String, default: null },
  amount: { type: Number, default: 0, min: 0 },
  currency: { type: String, default: null, maxlength: 3 },
  logged: { type: Boolean, default: false },
  by: { type: String, default: '', maxlength: 120 },
}, { _id: false });

// A household task that costs money and has a date: renew the car insurance, pay the arnona, the
// vehicle test, the passport. Ticking it off can log what it cost; a repeating one rolls on to its next date.
const houseTaskSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 200 },
  emoji: { type: String, default: '', maxlength: 16 },
  kind: { type: String, enum: TASK_KINDS, default: 'other' },
  notes: { type: String, default: '', maxlength: 2000 },
  dueDate: { type: String, default: null, match: /^\d{4}-\d{2}-\d{2}$/ },
  repeat: { type: String, enum: TASK_REPEATS, default: 'none' },
  // What it usually costs; 0 for tasks that cost nothing
  amount: { type: Number, default: 0, min: 0 },
  currency: { type: String, default: 'ILS', maxlength: 3 },
  category: { type: String, default: '', maxlength: 100 }, // the expense category it is logged under
  assignee: { type: String, default: '', maxlength: 120 }, // a member's email; empty is anyone
  remindDays: { type: Number, default: 7, min: 0, max: 90 },
  status: { type: String, enum: ['open', 'done'], default: 'open' },
  doneAt: { type: Date, default: null },
  history: { type: [doneSchema], default: [] },

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

houseTaskSchema.index({ status: 1, dueDate: 1 });

houseTaskSchema.virtual('id').get(function() {
  return this._id.toHexString();
});

houseTaskSchema.set('toJSON', { virtuals: true });
houseTaskSchema.set('toObject', { virtuals: true });

addDedupeKey(houseTaskSchema);

export default mongoose.models.HouseTask || mongoose.model('HouseTask', houseTaskSchema);
