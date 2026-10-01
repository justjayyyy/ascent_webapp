import './limits.js';
import mongoose from 'mongoose';

// A WebAuthn challenge the server handed out. Each one is consumed by the first verification that
// presents it (findOneAndDelete), so a captured passkey response cannot be replayed, and the TTL index
// sweeps the ones nobody answered. Stored in the database because serverless instances share no memory.
const authChallengeSchema = new mongoose.Schema({
  challenge: { type: String, required: true, unique: true },
  purpose: { type: String, enum: ['register', 'authenticate'], required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, // registration only
  rpID: { type: String, required: true },
  origin: { type: String, required: true },
  createdAt: { type: Date, default: Date.now, expires: 300 },
});

export default mongoose.models.AuthChallenge || mongoose.model('AuthChallenge', authChallengeSchema);
