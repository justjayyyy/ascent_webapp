import './limits.js';
import mongoose from 'mongoose';

// Long-lived credential for a phone's Shortcut. Scoped to one user and one workspace, can only add pending
// expenses, and is stored as a SHA-256 hash: the plaintext is shown once when the token is created.
const ingestTokenSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  workspaceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Workspace',
    required: true,
    index: true
  },
  label: {
    type: String,
    required: true,
    trim: true,
    maxlength: 60
  },
  prefix: {
    type: String,
    required: true // first characters of the token, only so people can tell tokens apart
  },
  tokenHash: {
    type: String,
    required: true,
    unique: true
  },
  lastUsedAt: {
    type: Date,
    default: null
  },
  useCount: {
    type: Number,
    default: 0
  },
  expiresAt: {
    type: Date,
    default: null
  },
  revokedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: { createdAt: 'created_date', updatedAt: 'updated_date' }
});

ingestTokenSchema.virtual('id').get(function() {
  return this._id.toHexString();
});

ingestTokenSchema.set('toJSON', { virtuals: true });
ingestTokenSchema.set('toObject', { virtuals: true });

export default mongoose.models.IngestToken || mongoose.model('IngestToken', ingestTokenSchema);
