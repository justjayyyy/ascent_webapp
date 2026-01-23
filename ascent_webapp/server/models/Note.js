import mongoose from 'mongoose';

const noteSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    default: 'Untitled'
  },
  content: {
    type: String,
    default: ''
  },
  color: {
    type: String,
    default: '#5C8374' // Default accent color
  },
  isPinned: {
    type: Boolean,
    default: false
  },
  tags: [{
    type: String
  }],
  created_by: {
    type: String,
    required: true,
    index: true
  }
}, {
  timestamps: { createdAt: 'created_date', updatedAt: 'updated_date' }
});

noteSchema.virtual('id').get(function() {
  return this._id.toHexString();
});

noteSchema.set('toJSON', { virtuals: true });
noteSchema.set('toObject', { virtuals: true });

export default mongoose.models.Note || mongoose.model('Note', noteSchema);

