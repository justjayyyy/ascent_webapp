// /api/ingest-tokens: create, list and revoke the tokens phones use to report purchases.
// Uses the normal login (JWT + workspace header); the tokens themselves are only accepted by /api/ingest/*.
import mongoose from 'mongoose';
import connectDB from '../lib/mongodb.js';
import { handleCors } from '../lib/cors.js';
import { success, error, forbidden, notFound, serverError } from '../lib/response.js';
import { authMiddleware } from '../middleware/auth.js';
import { memberCanSubmit } from '../lib/ingest/access.js';
import { newToken } from '../lib/ingest/tokens.js';
import { cleanText } from '../lib/ingest/text.js';
import IngestToken from '../models/IngestToken.js';
import IngestEvent from '../models/IngestEvent.js';

const MAX_ACTIVE = 5;

const publicToken = (t) => ({
  id: String(t._id),
  label: t.label,
  prefix: t.prefix,
  lastUsedAt: t.lastUsedAt ?? null,
  useCount: t.useCount ?? 0,
  created_date: t.created_date,
});

const publicEvent = (e) => ({
  id: String(e._id),
  source: e.source,
  outcome: e.outcome,
  reason: e.reason || '',
  summary: e.summary ?? null,
  transactionId: e.transactionId ? String(e.transactionId) : null,
  createdAt: e.createdAt,
});

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  try {
    const user = await authMiddleware(req, res);
    if (!user) return;

    await connectDB();

    if (!req.workspace) return error(res, 'Workspace context required', 400);
    if (!memberCanSubmit(req.member)) return forbidden(res, 'forbidden');

    const scope = { userId: user._id, workspaceId: req.workspace._id };

    switch (req.method) {
      case 'GET': {
        if (req.query.activity) {
          const events = await IngestEvent.find(scope).sort('-createdAt').limit(20).lean();
          return success(res, events.map(publicEvent));
        }
        const tokens = await IngestToken.find({ ...scope, revokedAt: null }).sort('-created_date').lean();
        return success(res, tokens.map(publicToken));
      }

      case 'POST': {
        const label = cleanText(typeof req.body?.label === 'string' ? req.body.label : '', 60) || 'iPhone';
        const active = await IngestToken.countDocuments({ ...scope, revokedAt: null });
        if (active >= MAX_ACTIVE) return error(res, 'token_limit', 409);

        // The plaintext exists only in this response; the database keeps the hash.
        const { token, tokenHash, prefix } = newToken();
        const doc = await IngestToken.create({ ...scope, label, prefix, tokenHash });
        return success(res, { ...publicToken(doc.toObject()), token }, 201);
      }

      case 'DELETE': {
        const id = req.query.id;
        if (typeof id !== 'string' || !mongoose.isValidObjectId(id)) return error(res, 'invalid_id', 400);

        const mayRevokeOthers = req.member.role === 'owner' || req.member.role === 'admin';
        const revoked = await IngestToken.findOneAndUpdate(
          { _id: id, workspaceId: req.workspace._id, revokedAt: null, ...(mayRevokeOthers ? {} : { userId: user._id }) },
          { $set: { revokedAt: new Date() } },
          { new: true }
        ).lean();
        if (!revoked) return notFound(res, 'Token not found');
        return success(res, { revoked: true, id });
      }

      default:
        return error(res, 'Method not allowed', 405);
    }
  } catch (err) {
    console.error('[IngestTokens] failed:', err?.message);
    return serverError(res, err);
  }
}
