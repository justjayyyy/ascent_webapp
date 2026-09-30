import mongoose from 'mongoose';

const itemSchema = new mongoose.Schema({
  id: { type: String, required: true },
  text: { type: String, default: '' },
  done: { type: Boolean, default: false }
}, { _id: false });

const collaboratorSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  email: { type: String, lowercase: true, trim: true },
  role: { type: String, enum: ['viewer', 'editor'], default: 'viewer' }
}, { _id: false });

const attachmentSchema = new mongoose.Schema({
  id: { type: String, required: true },
  name: { type: String, default: '' },
  type: { type: String, default: '' },
  size: { type: Number, default: 0 }
}, { _id: false });

// A personal reminder: each person sets their own time for a note
const reminderSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  at: { type: Date, required: true },
  // After it fires the client moves `at` to the next occurrence
  repeat: { type: String, enum: ['none', 'daily', 'weekly', 'monthly', 'yearly'], default: 'none' }
}, { _id: false });

const noteSchema = new mongoose.Schema({
  title: {
    type: String,
    default: ''
  },
  content: {
    type: String,
    default: ''
  },
  // 'text' notes use `content`; 'checklist' notes use `items`
  type: {
    type: String,
    enum: ['text', 'checklist'],
    default: 'text'
  },
  items: [itemSchema],
  // Metadata only; the bytes are stored in NoteFile
  attachments: [attachmentSchema],
  reminders: [reminderSchema],
  // A palette key (see NOTE_COLORS on the client) or a legacy '#rrggbb' value
  color: {
    type: String,
    default: 'default'
  },
  tags: [{
    type: String
  }],
  // Legacy: pin flag from before pinning became per person. Mirrored for the creator.
  isPinned: {
    type: Boolean,
    default: false
  },
  // Pin and archive are personal: archiving a shared note must not hide it from others
  pinnedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  archivedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  // Visible to every workspace member who has notes access
  isShared: {
    type: Boolean,
    default: true
  },
  // Named people this note is shared with, regardless of their workspace notes permission
  collaborators: [collaboratorSchema],
  // Set when moved to the trash; the note is purged for good after 7 days
  trashedAt: {
    type: Date,
    default: null
  },
  updatedByEmail: {
    type: String
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

noteSchema.index({ workspaceId: 1, createdBy: 1 });
noteSchema.index({ workspaceId: 1, 'collaborators.userId': 1 });

noteSchema.virtual('id').get(function() {
  return this._id.toHexString();
});

noteSchema.set('toJSON', { virtuals: true });
noteSchema.set('toObject', { virtuals: true });

export default mongoose.models.Note || mongoose.model('Note', noteSchema);
