// Passkeys (WebAuthn) for Face ID / Touch ID / fingerprint sign-in and for unlocking the app.
//
//   POST ?action=register-options   (signed in)  -> options for navigator.credentials.create
//   POST ?action=register-verify    (signed in)  { response, name? } -> saves the passkey
//   POST ?action=login-options      (public)     -> options for navigator.credentials.get
//   POST ?action=login-verify       (public)     { response } -> { user, token, unlocked }
//   GET  ?action=list               (signed in)  -> this account's passkeys (no key material)
//   PUT  ?action=rename&id=...      (signed in)  { name }
//   DELETE ?action=remove&id=...    (signed in)
//
// Challenges are single use (AuthChallenge). Signing in from a lock screen that still holds this
// device's current session keeps that session ("unlock"); anything else starts a new one, which, as
// with a password sign-in, signs the account out elsewhere.
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import connectDB from '../lib/mongodb.js';
import User from '../models/User.js';
import AuthChallenge from '../models/AuthChallenge.js';
import { authMiddleware } from '../middleware/auth.js';
import { issueSession, isLiveSession } from '../lib/session.js';
import { verifyToken, getTokenFromHeader } from '../lib/jwt.js';
import { handleCors } from '../lib/cors.js';
import { success, error, serverError } from '../lib/response.js';
import { authRateLimit } from '../lib/rateLimit.js';
import { relyingParty, deviceLabel, toBase64Url, fromBase64Url } from '../lib/webauthn.js';

const MAX_PASSKEYS = 10;

const publicList = (user) => (user.passkeys || []).map((p) => ({
  id: p.credentialID,
  name: p.name,
  deviceType: p.deviceType,
  backedUp: p.backedUp,
  createdAt: p.createdAt,
  lastUsedAt: p.lastUsedAt,
}));

async function takeChallenge(challenge, purpose, rp) {
  if (typeof challenge !== 'string' || !challenge) return null;
  return AuthChallenge.findOneAndDelete({ challenge, purpose, rpID: rp.rpID, origin: rp.origin }).lean();
}

// The challenge the browser signed sits base64url-encoded inside clientDataJSON
function challengeOf(response) {
  try {
    return JSON.parse(Buffer.from(response.response.clientDataJSON, 'base64url').toString('utf8')).challenge;
  } catch {
    return null;
  }
}

async function registerOptions(req, res, user, rp) {
  const full = await User.findById(user._id).select('email full_name passkeys');
  if ((full.passkeys || []).length >= MAX_PASSKEYS) return error(res, 'passkey_limit', 409);
  const options = await generateRegistrationOptions({
    rpName: rp.rpName,
    rpID: rp.rpID,
    userName: full.email,
    userDisplayName: full.full_name || full.email,
    userID: new TextEncoder().encode(String(full._id)),
    attestationType: 'none',
    excludeCredentials: (full.passkeys || []).map((p) => ({ id: p.credentialID, transports: p.transports })),
    authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
    preferredAuthenticatorType: 'localDevice',
  });
  await AuthChallenge.create({ challenge: options.challenge, purpose: 'register', userId: full._id, rpID: rp.rpID, origin: rp.origin });
  return success(res, options);
}

async function registerVerify(req, res, user, rp) {
  const { response, name } = req.body || {};
  if (!response?.id || !response?.response) return error(res, 'invalid_response', 400);
  const stored = await takeChallenge(challengeOf(response), 'register', rp);
  if (!stored || String(stored.userId) !== String(user._id)) return error(res, 'challenge_expired', 400);

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: stored.challenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.rpID,
      requireUserVerification: true,
    });
  } catch {
    return error(res, 'verification_failed', 400);
  }
  if (!verification.verified) return error(res, 'verification_failed', 400);

  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
  const full = await User.findById(user._id);
  if (full.passkeys.some((p) => p.credentialID === credential.id)) return success(res, publicList(full));
  full.passkeys.push({
    credentialID: credential.id,
    publicKey: toBase64Url(credential.publicKey),
    counter: credential.counter,
    transports: credential.transports?.length ? credential.transports : (response.response.transports || undefined),
    deviceType: credentialDeviceType,
    backedUp: credentialBackedUp,
    name: String(name || '').trim().slice(0, 60) || deviceLabel(req.headers['user-agent']),
  });
  await full.save();
  return success(res, publicList(full), 201);
}

async function loginOptions(req, res, rp) {
  // No allowCredentials: the browser offers whichever passkey this person has for the site
  const options = await generateAuthenticationOptions({ rpID: rp.rpID, userVerification: 'required' });
  await AuthChallenge.create({ challenge: options.challenge, purpose: 'authenticate', rpID: rp.rpID, origin: rp.origin });
  return success(res, options);
}

async function loginVerify(req, res, rp) {
  const { response } = req.body || {};
  if (!response?.id || !response?.response) return error(res, 'invalid_response', 400);
  const stored = await takeChallenge(challengeOf(response), 'authenticate', rp);
  if (!stored) return error(res, 'challenge_expired', 400);

  const user = await User.findOne({ 'passkeys.credentialID': response.id });
  const passkey = user?.passkeys.find((p) => p.credentialID === response.id);
  // Same answer for "no such passkey" and "bad signature": the browser can drop an unknown one
  if (!passkey) return error(res, 'unknown_passkey', 401);

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: stored.challenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.rpID,
      credential: {
        id: passkey.credentialID,
        publicKey: fromBase64Url(passkey.publicKey),
        counter: passkey.counter,
        transports: passkey.transports,
      },
      requireUserVerification: true,
    });
  } catch {
    return error(res, 'verification_failed', 401);
  }
  if (!verification.verified) return error(res, 'verification_failed', 401);

  passkey.counter = verification.authenticationInfo.newCounter;
  passkey.backedUp = verification.authenticationInfo.credentialBackedUp;
  passkey.lastUsedAt = new Date();
  user.lastLogin = new Date();
  if (user.isFirstLogin) user.isFirstLogin = false;

  // Unlocking a device whose session is still live keeps that session instead of starting another
  const current = getTokenFromHeader(req);
  const decoded = current ? verifyToken(current) : null;
  const unlocked = !!(decoded && String(decoded.userId) === String(user._id) && isLiveSession(user, decoded.sid));
  const token = unlocked ? current : await issueSession(user, { userAgent: req.headers?.['user-agent'] });
  await user.save();

  return success(res, { user: user.toJSON(), token, unlocked });
}

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  const action = req.query?.action;

  try {
    if (action === 'login-options' || action === 'login-verify') {
      if (req.method !== 'POST') return error(res, 'Method not allowed', 405);
      if (authRateLimit(req, res)) return;
      const rp = relyingParty(req);
      if (!rp) return error(res, 'origin_not_allowed', 403);
      await connectDB();
      return action === 'login-options' ? loginOptions(req, res, rp) : loginVerify(req, res, rp);
    }

    const user = await authMiddleware(req, res);
    if (!user) return;

    if (action === 'list' && req.method === 'GET') {
      const full = await User.findById(user._id).select('passkeys');
      return success(res, publicList(full));
    }

    if (action === 'rename' && (req.method === 'PUT' || req.method === 'PATCH')) {
      const name = String(req.body?.name || '').trim().slice(0, 60);
      if (!name) return error(res, 'name_required', 400);
      const full = await User.findOneAndUpdate(
        { _id: user._id, 'passkeys.credentialID': req.query.id },
        { $set: { 'passkeys.$.name': name } },
        { new: true }
      ).select('passkeys');
      if (!full) return error(res, 'not_found', 404);
      return success(res, publicList(full));
    }

    if (action === 'remove' && req.method === 'DELETE') {
      const full = await User.findByIdAndUpdate(
        user._id,
        { $pull: { passkeys: { credentialID: req.query.id } } },
        { new: true }
      ).select('passkeys');
      return success(res, publicList(full));
    }

    if (action === 'register-options' || action === 'register-verify') {
      if (req.method !== 'POST') return error(res, 'Method not allowed', 405);
      const rp = relyingParty(req);
      if (!rp) return error(res, 'origin_not_allowed', 403);
      return action === 'register-options' ? registerOptions(req, res, user, rp) : registerVerify(req, res, user, rp);
    }

    return error(res, 'unknown_action', 400);
  } catch (err) {
    return serverError(res, err);
  }
}
