import './limits.js';
import mongoose from 'mongoose';

// Attempt counters shared by every server instance (lib/authLimit.js). Each document is one counter
// for one window; MongoDB deletes it when the window ends.
const rateLimitSchema = new mongoose.Schema({
  _id: { type: String, maxlength: 300 }, // "<what>:<who>", e.g. "ip:login:203.0.113.5" or "fail:dana@x.test"
  count: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true },
}, { versionKey: false });

rateLimitSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.models.RateLimit || mongoose.model('RateLimit', rateLimitSchema);
