import mongoose from 'mongoose';

// One cost inside a plan: flights, the venue, a deposit. Money for big events leaves in pieces,
// often months before the day, so each item carries its own due date and payment state.
const planItemSchema = new mongoose.Schema({
  id: { type: String, required: true },
  name: { type: String, default: '', maxlength: 200 },
  category: { type: String, default: '' },
  amount: { type: Number, default: 0, min: 0 },
  dueDate: { type: String, default: null }, // yyyy-MM-dd, when the money is expected to go out
  status: { type: String, enum: ['planned', 'booked', 'paid'], default: 'planned' },
  transactionId: { type: String, default: null }, // the expense recorded when it was paid
  note: { type: String, default: '', maxlength: 1000 }
}, { _id: false });

// A big upcoming event or purchase that is paid for over time (vacation, wedding, moving, a car).
const planSchema = new mongoose.Schema({
  name: { type: String, required: true, maxlength: 200 },
  kind: {
    type: String,
    enum: ['vacation', 'wedding', 'move', 'renovation', 'baby', 'car', 'purchase', 'event', 'other'],
    default: 'other'
  },
  emoji: { type: String, default: '', maxlength: 16 },
  startDate: { type: String, default: null }, // yyyy-MM-dd, the day of the event
  endDate: { type: String, default: null },
  budget: { type: Number, default: 0, min: 0 },
  currency: { type: String, default: 'ILS' },
  items: [planItemSchema],
  notes: { type: String, default: '', maxlength: 5000 },
  status: { type: String, enum: ['active', 'done', 'archived'], default: 'active' },
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

planSchema.virtual('id').get(function() {
  return this._id.toHexString();
});

planSchema.set('toJSON', { virtuals: true });
planSchema.set('toObject', { virtuals: true });

export default mongoose.models.Plan || mongoose.model('Plan', planSchema);
