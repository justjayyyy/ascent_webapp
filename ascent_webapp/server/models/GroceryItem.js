import './limits.js';
import mongoose from 'mongoose';
import { addDedupeKey } from './dedupe.js';

export const AISLES = ['produce', 'dairy', 'bakery', 'meat', 'pantry', 'frozen', 'drinks', 'snacks', 'household', 'personal', 'baby', 'pets', 'other'];
export const LEVELS = ['full', 'half', 'low', 'out'];

// One time it was bought. The gaps between these are how the app learns how long it lasts.
const purchaseSchema = new mongoose.Schema({
  id: { type: String, required: true },
  date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ }, // the buyer's own day
  qty: { type: String, default: '', maxlength: 40 },
  price: { type: Number, default: null, min: 0 },
  currency: { type: String, default: null, maxlength: 3 },
  by: { type: String, default: '', maxlength: 120 }, // who bought it (their email)
}, { _id: false });

// Something the household buys: either just on this trip's list, or a staple whose supply is tracked
// (bought every so often, with a level that runs down between purchases). One row per thing, so ticking
// items off in the shop is a small change to one row and two people shopping at once never collide.
const groceryItemSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  emoji: { type: String, default: '', maxlength: 16 },
  aisle: { type: String, enum: AISLES, default: 'other' },
  // Supply tracked in the pantry: true / false when someone chose, null = automatically once bought twice
  staple: { type: Boolean, default: null },

  // On the shopping list
  onList: { type: Boolean, default: false },
  qty: { type: String, default: '', maxlength: 40 },
  note: { type: String, default: '', maxlength: 300 },
  listedAt: { type: Date, default: null },
  listedBy: { type: String, default: '', maxlength: 120 },
  inCart: { type: Boolean, default: false },
  cartBy: { type: String, default: '', maxlength: 120 },

  // Supply: a level someone set by hand (it wins over the learned guess from that moment on)
  level: { type: String, enum: [...LEVELS, null], default: null },
  levelAt: { type: Date, default: null },
  lastsDays: { type: Number, default: null, min: 1, max: 365 }, // "lasts about", set by hand
  purchases: { type: [purchaseSchema], default: [] },

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

groceryItemSchema.virtual('id').get(function() {
  return this._id.toHexString();
});

groceryItemSchema.set('toJSON', { virtuals: true });
groceryItemSchema.set('toObject', { virtuals: true });

addDedupeKey(groceryItemSchema);

export default mongoose.models.GroceryItem || mongoose.model('GroceryItem', groceryItemSchema);
