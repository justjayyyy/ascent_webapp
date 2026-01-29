import mongoose from 'mongoose';

const memberSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User' 
  },
  email: { 
    type: String, 
    required: true, 
    lowercase: true, 
    trim: true 
  },
  role: { 
    type: String, 
    enum: ['owner', 'admin', 'editor', 'viewer'], 
    default: 'viewer' 
  },
  status: { 
    type: String, 
    enum: ['pending', 'accepted', 'rejected'], 
    default: 'pending' 
  },
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
  members: [memberSchema]
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
