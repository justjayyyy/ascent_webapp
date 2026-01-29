import mongoose from 'mongoose';

const financialGoalSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  targetAmount: {
    type: Number,
    required: true
  },
  currentAmount: {
    type: Number,
    default: 0
  },
  targetDate: {
    type: String,
    default: null
  },
  category: {
    type: String,
    enum: ['savings', 'investment', 'retirement', 'purchase', 'emergency', 'other'],
    default: 'savings'
  },
  linkedAccountIds: [{
    type: String
  }],
  notes: {
    type: String,
    default: ''
  },
  isCompleted: {
    type: Boolean,
    default: false
  },
  workspaceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Workspace',
    required: true,
    index: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: { createdAt: 'created_date', updatedAt: 'updated_date' }
});

financialGoalSchema.virtual('id').get(function() {
  return this._id.toHexString();
});

financialGoalSchema.set('toJSON', { virtuals: true });
financialGoalSchema.set('toObject', { virtuals: true });

export default mongoose.models.FinancialGoal || mongoose.model('FinancialGoal', financialGoalSchema);

