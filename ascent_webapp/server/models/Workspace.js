import mongoose from 'mongoose';

const memberSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User' 
  },
  // Empty for QR/link invites until someone accepts; the accepting account's email is stored then.
  email: {
    type: String,
    default: '',
    lowercase: true,
    trim: true
  },
  inviteKind: { type: String, enum: ['email', 'link'], default: 'email' },
  expiresAt: { type: Date, default: null },
  role: { 
    type: String, 
    enum: ['owner', 'admin', 'editor', 'viewer'], 
    default: 'viewer' 
  },
  status: { 
    type: String, 
    enum: ['pending', 'accepted', 'declined', 'rejected'], 
    default: 'pending' 
  },
  invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  invitedAt: { type: Date, default: null },
  joinedAt: { type: Date, default: null },
  lastSeenAt: { type: Date, default: null },
  permissions: {
    viewPortfolio: { type: Boolean, default: true },
    editPortfolio: { type: Boolean, default: false },
    viewExpenses: { type: Boolean, default: true },
    editExpenses: { type: Boolean, default: false },
    viewNotes: { type: Boolean, default: false },
    editNotes: { type: Boolean, default: false },
    viewGoals: { type: Boolean, default: false },
    editGoals: { type: Boolean, default: false },
    viewBudgets: { type: Boolean, default: false },
    editBudgets: { type: Boolean, default: false },
    viewSettings: { type: Boolean, default: false },
    manageCards: { type: Boolean, default: false },
    manageUsers: { type: Boolean, default: false }
  }
});

const workspaceSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: true,
    trim: true
  },
  ownerId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  members: [memberSchema],
  // Household-wide choices the owner makes. The AI assistant is off until someone turns it on, since
  // it sends summaries of the workspace's spending to an outside service.
  settings: {
    aiAssistant: { type: Boolean, default: false },
    largeExpenseAlert: { type: Number, default: null, min: 0 }, // notify the others at or above this amount
    largeExpenseCurrency: { type: String, default: null }
  }
}, {
  timestamps: { createdAt: 'created_date', updatedAt: 'updated_date' }
});

// Virtual for id
workspaceSchema.virtual('id').get(function() {
  return this._id.toHexString();
});

workspaceSchema.set('toJSON', { virtuals: true });
workspaceSchema.set('toObject', { virtuals: true });

export default mongoose.models.Workspace || mongoose.model('Workspace', workspaceSchema);
