import mongoose from 'mongoose';

const categorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  nameKey: {
    type: String,
    default: null // Translation key for default categories
  },
  type: {
    type: String,
    enum: ['Income', 'Expense', 'Both'],
    default: 'Expense'
  },
  icon: {
    type: String,
    default: ''
  },
  color: {
    type: String,
    default: '#5C8374'
  },
  isDefault: {
    type: Boolean,
    default: false
  },
  created_by: {
    type: String,
    required: true,
    index: true
  }
}, {
  timestamps: { createdAt: 'created_date', updatedAt: 'updated_date' }
});

categorySchema.virtual('id').get(function() {
  return this._id.toHexString();
});

categorySchema.set('toJSON', { virtuals: true });
categorySchema.set('toObject', { virtuals: true });

export default mongoose.models.Category || mongoose.model('Category', categorySchema);

