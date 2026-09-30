import mongoose from 'mongoose';

// One row per request a token makes. It is the rate-limit counter, the "Recent activity" list in Settings and the
// place a rejected payload can be inspected. Rows expire after 30 days.
const ingestEventSchema = new mongoose.Schema({
  tokenId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'IngestToken',
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  workspaceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Workspace',
    required: true
  },
  source: {
    type: String,
    enum: ['wallet', 'sms', 'statement'],
    required: true
  },
  outcome: {
    type: String,
    enum: ['created', 'merged', 'duplicate', 'flagged', 'rejected', 'forbidden'],
    required: true
  },
  reason: {
    type: String,
    default: ''
  },
  transactionId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null
  },
  summary: {
    merchant: String,
    amount: Number,
    currency: String
  },
  payload: {
    type: mongoose.Schema.Types.Mixed // the few text fields the Shortcut sent, each capped in length
  },
  gapMs: {
    type: Number // for merges: how far apart the two reports were, to tune the matching window
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 60 * 60 * 24 * 30
  }
});

ingestEventSchema.index({ tokenId: 1, createdAt: -1 });
ingestEventSchema.index({ workspaceId: 1, userId: 1, createdAt: -1 });

ingestEventSchema.virtual('id').get(function() {
  return this._id.toHexString();
});

ingestEventSchema.set('toJSON', { virtuals: true });
ingestEventSchema.set('toObject', { virtuals: true });

export default mongoose.models.IngestEvent || mongoose.model('IngestEvent', ingestEventSchema);
