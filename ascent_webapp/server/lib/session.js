import { randomUUID } from 'crypto';
import User from '../models/User.js';
import { signToken } from './jwt.js';

// One active session per user: every sign-in rotates user.sessionId and embeds it in the token
// (claim `sid`). The auth middleware rejects any token whose sid no longer matches, so signing in
// on a new device signs the previous one out.
export async function issueSession(user) {
  const sessionId = randomUUID();
  await User.updateOne({ _id: user._id }, { $set: { sessionId } });
  user.sessionId = sessionId;
  return signToken({ userId: user._id, email: user.email, sid: sessionId });
}
