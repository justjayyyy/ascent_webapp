import mongoose from 'mongoose';

const pageLayoutSchema = new mongoose.Schema({
  pageName: {
    type: String,
    required: true
  },
  widgetType: {
    type: String,
    required: true
  },
  x: {
    type: Number,
    default: 0
  },
  y: {
    type: Number,
    default: 0
  },
  w: {
    type: Number,
    default: 1
  },
  h: {
    type: Number,
    default: 1
  },
  enabled: {
    type: Boolean,
    default: true
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

pageLayoutSchema.virtual('id').get(function() {
  return this._id.toHexString();
});

pageLayoutSchema.set('toJSON', { virtuals: true });
pageLayoutSchema.set('toObject', { virtuals: true });

export default mongoose.models.PageLayout || mongoose.model('PageLayout', pageLayoutSchema);

