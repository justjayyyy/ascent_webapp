import './limits.js';
import mongoose from 'mongoose';

// A receipt kept in the household's vault: the photo (or PDF) and what it says. The bytes stay on this
// row but are left out of the list, which only carries what the cards show.
const receiptSchema = new mongoose.Schema({
  store: { type: String, default: '', maxlength: 80 },
  date: { type: String, default: '', match: /^(\d{4}-\d{2}-\d{2})?$/ }, // the day on the receipt
  total: { type: Number, default: null, min: 0 },
  currency: { type: String, default: null, maxlength: 3 },
  note: { type: String, default: '', maxlength: 300 },
  // The assistant has read the photo (so it isn't offered again)
  read: { type: Boolean, default: false },

  name: { type: String, default: 'receipt', maxlength: 200 },
  type: { type: String, required: true, maxlength: 100 },
  size: { type: Number, required: true },
  data: { type: Buffer, required: true },
  // A small JPEG for the vault's grid (photos only)
  thumb: { type: Buffer, default: null },

  addedBy: { type: String, default: '', maxlength: 120 }, // their email
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, {
  timestamps: { createdAt: 'created_date', updatedAt: 'updated_date' }
});

receiptSchema.index({ workspaceId: 1, date: -1 });

export default mongoose.models.Receipt || mongoose.model('Receipt', receiptSchema);
