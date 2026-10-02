import { randomUUID } from 'crypto';
import User from '../models/User.js';
import { signToken } from './jwt.js';

// Sessions: every sign-in adds one (embedded in the token as `sid`), so a phone and a computer can be
// signed in at once. The auth middleware accepts a token only while its sid is still listed: signing out
// ends that one, "sign out other devices" and a password reset end the rest, and the oldest drop off past
// MAX_SESSIONS. Accounts from before keep their single `sessionId` working until it is ended.
export const MAX_SESSIONS = 10;

/** A short, non-identifying name for the device ("Safari on iPhone"). */
export function deviceLabel(userAgent = '') {
  const ua = String(userAgent);
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android'
    : /Mac OS X|Macintosh/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : '';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome'
    : /Safari\//.test(ua) ? 'Safari' : '';
  return [browser, os].filter(Boolean).join(' on ') || 'Unknown device';
}

/** Whether `sid` is one of the user's live sessions. */
export function isLiveSession(user, sid) {
  if (!sid || !user) return false;
  return (user.sessions || []).some((s) => s.id === sid) || (!!user.sessionId && user.sessionId === sid);
}

/** Starts a session and returns its token. `only: true` ends every other session (a password reset). */
export async function issueSession(user, { userAgent, only = false } = {}) {
  const entry = { id: randomUUID(), createdAt: new Date(), device: deviceLabel(userAgent) };
  const update = only
    ? { $set: { sessions: [entry] }, $unset: { sessionId: 1 } }
    : { $push: { sessions: { $each: [entry], $slice: -MAX_SESSIONS } } };
  await User.updateOne({ _id: user._id }, update);
  user.sessions = only ? [entry] : [...(user.sessions || []), entry].slice(-MAX_SESSIONS);
  if (only) user.sessionId = undefined;
  return signToken({ userId: user._id, email: user.email, sid: entry.id });
}

/** Ends one session (signing out on this device). */
export async function endSession(userId, sid) {
  await User.updateOne({ _id: userId }, { $pull: { sessions: { id: sid } } });
  await User.updateOne({ _id: userId, sessionId: sid }, { $unset: { sessionId: 1 } });
}

/** Ends every session but `keepSid` (signing out the other devices). */
export async function endOtherSessions(userId, keepSid) {
  await User.updateOne({ _id: userId }, { $pull: { sessions: { id: { $ne: keepSid } } } });
  await User.updateOne({ _id: userId, sessionId: { $ne: keepSid } }, { $unset: { sessionId: 1 } });
}
