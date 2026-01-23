import mongoose from 'mongoose';

const sharedUserSchema = new mongoose.Schema({
  invitedEmail: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  displayName: {
    type: String,
    default: ''
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'rejected'],
    default: 'pending'
  },
  permissions: {
    viewPortfolio: { type: Boolean, default: true },
    viewDashboard: { type: Boolean, default: true },
    viewExpenses: { type: Boolean, default: true },
    viewSettings: { type: Boolean, default: false },
    editPortfolio: { type: Boolean, default: false },
    editExpenses: { type: Boolean, default: false },
    manageUsers: { type: Boolean, default: false }
  },
  created_by: {
    type: String,
    required: true,
    index: true
  }
}, {
  timestamps: { createdAt: 'created_date', updatedAt: 'updated_date' }
});

sharedUserSchema.virtual('id').get(function() {
  return this._id.toHexString();
});

sharedUserSchema.set('toJSON', { virtuals: true });
sharedUserSchema.set('toObject', { virtuals: true });

export default mongoose.models.SharedUser || mongoose.model('SharedUser', sharedUserSchema);

