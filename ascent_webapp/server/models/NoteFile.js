import mongoose from 'mongoose';

// File attachments for notes. The bytes live here (not on the note) so listing notes stays light.
const noteFileSchema = new mongoose.Schema({
  noteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Note', required: true, index: true },
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
  name: { type: String, required: true },
  type: { type: String, default: 'application/octet-stream' },
  size: { type: Number, required: true },
  data: { type: Buffer, required: true },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, {
  timestamps: { createdAt: 'created_date', updatedAt: 'updated_date' }
});

export default mongoose.models.NoteFile || mongoose.model('NoteFile', noteFileSchema);
