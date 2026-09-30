import mongoose from 'mongoose';

// Money one household member paid another to even out split expenses ("settle up").
// People are emails, like `created_by` and `paidBy` on transactions.
const settlementSchema = new mongoose.Schema({
  from: { type: String, required: true, lowercase: true, trim: true }, // who paid back
  to: { type: String, required: true, lowercase: true, trim: true },
  amount: { type: Number, required: true, min: 0.01 },
  currency: { type: String, default: 'ILS' },
  date: { type: String, required: true }, // yyyy-MM-dd
  note: { type: String, default: '', maxlength: 200 },
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

settlementSchema.virtual('id').get(function() {
  return this._id.toHexString();
});

settlementSchema.set('toJSON', { virtuals: true });
settlementSchema.set('toObject', { virtuals: true });

export default mongoose.models.Settlement || mongoose.model('Settlement', settlementSchema);
