import './limits.js';
import mongoose from 'mongoose';

// "Payments at this merchant go in this category", learned from what people in the workspace chose.
// A correction replaces the rule at once, so the next payment there is filed the way they want.
const merchantRuleSchema = new mongoose.Schema({
  workspaceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Workspace',
    required: true
  },
  merchantKey: {
    type: String,
    required: true,
    maxlength: 200
  },
  type: {
    type: String,
    enum: ['Income', 'Expense'],
    default: 'Expense'
  },
  category: {
    type: String,
    required: true
  },
  hits: {
    type: Number,
    default: 1 // how many times in a row this category was chosen for the merchant
  },
  updatedBy: {
    type: String // email of whoever set it last
  }
}, {
  timestamps: { createdAt: 'created_date', updatedAt: 'updated_date' }
});

merchantRuleSchema.index({ workspaceId: 1, merchantKey: 1, type: 1 }, { unique: true });

merchantRuleSchema.virtual('id').get(function() {
  return this._id.toHexString();
});

merchantRuleSchema.set('toJSON', { virtuals: true });
merchantRuleSchema.set('toObject', { virtuals: true });

export default mongoose.models.MerchantRule || mongoose.model('MerchantRule', merchantRuleSchema);
