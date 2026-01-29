import mongoose from 'mongoose';

const dashboardWidgetSchema = new mongoose.Schema({
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
  settings: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
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

dashboardWidgetSchema.virtual('id').get(function() {
  return this._id.toHexString();
});

dashboardWidgetSchema.set('toJSON', { virtuals: true });
dashboardWidgetSchema.set('toObject', { virtuals: true });

export default mongoose.models.DashboardWidget || mongoose.model('DashboardWidget', dashboardWidgetSchema);

