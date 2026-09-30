// POST /api/ingest/:kind  (kind: wallet)
// Receives one purchase reported by a phone's Shortcut and files it as a pending expense.
// Auth is a per-device ingest token (never the login JWT); the workspace comes from the token, not from the request.
import connectDB from '../lib/mongodb.js';
import { success, error, unauthorized, serverError } from '../lib/response.js';
import { authRateLimit } from '../lib/rateLimit.js';
import User from '../models/User.js';
import Workspace from '../models/Workspace.js';
import Card from '../models/Card.js';
import ExpenseTransaction from '../models/ExpenseTransaction.js';
import IngestToken from '../models/IngestToken.js';
import IngestEvent from '../models/IngestEvent.js';
import Category from '../models/Category.js';
import { suggestCategory } from '../lib/categorize.js';
import { hashToken, tokenFromHeader } from '../lib/ingest/tokens.js';
import { memberCanSubmit } from '../lib/ingest/access.js';
import { parseWalletPayload } from '../lib/ingest/wallet.js';
import { matchCard } from '../lib/ingest/cards.js';
import { dedupeKey, decideMatch, planMerge, WINDOWS } from '../lib/ingest/match.js';
import { shiftDate } from '../lib/ingest/time.js';

const PARSERS = { wallet: parseWalletPayload };
const RATE = { windowMs: 10 * 60_000, max: 60 };
const CANDIDATE_FIELDS = 'amount currency occurredAt date status source cardId merchant merchantKey description ingest';

const clip = (v) => (typeof v === 'string' || typeof v === 'number' ? String(v).slice(0, 200) : undefined);
const snapshot = (body) =>
  body && typeof body === 'object' && !Array.isArray(body)
    ? { merchant: clip(body.merchant), amount: clip(body.amount), card: clip(body.card), at: clip(body.at) }
    : undefined;

export default async function handler(req, res) {
  if (req.method !== 'POST') return error(res, 'method_not_allowed', 405);

  const kind = String(req.query.kind ?? '');
  const parse = PARSERS[kind];
  if (!parse) return error(res, 'unknown_source', 404);

  // Wrong or missing credentials look identical to the caller, and repeated failures are throttled per IP.
  const denied = () => (authRateLimit(req, res) ? undefined : unauthorized(res, 'unauthorized'));
  const raw = tokenFromHeader(req.headers);
  if (!raw) return denied();

  try {
    await connectDB();

    const token = await IngestToken.findOne({
      tokenHash: hashToken(raw),
      revokedAt: null,
      $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
    }).lean();
    if (!token) return denied();

    // What the caller learns is limited to { id, outcome }; every request is recorded for the Settings activity list.
    const finish = async ({ outcome, reason = '', transactionId = null, status = 200, ev = null, gapMs, code }) => {
      const accepted = outcome === 'created' || outcome === 'merged' || outcome === 'flagged';
      await Promise.all([
        IngestEvent.create({
          tokenId: token._id,
          userId: token.userId,
          workspaceId: token.workspaceId,
          source: kind,
          outcome,
          reason,
          transactionId,
          summary: ev ? { merchant: ev.merchant, amount: ev.amount, currency: ev.currency } : undefined,
          payload: snapshot(req.body),
          gapMs,
        }).catch((err) => console.error('[Ingest] could not record event:', err.message)),
        IngestToken.updateOne(
          { _id: token._id },
          { $set: { lastUsedAt: new Date() }, ...(accepted ? { $inc: { useCount: 1 } } : {}) }
        ).catch((err) => console.error('[Ingest] could not update token:', err.message)),
      ]);
      if (code) return error(res, code, status);
      return success(res, { id: transactionId ? String(transactionId) : null, outcome }, status);
    };

    // Membership is checked on every request, so removing or demoting someone silences their token at once.
    const [user, workspace] = await Promise.all([
      User.findById(token.userId).select('email currency').lean(),
      Workspace.findOne({
        _id: token.workspaceId,
        members: { $elemMatch: { userId: token.userId, status: { $in: ['accepted', null] } } },
      }).lean(),
    ]);
    const member = workspace?.members?.find((m) => String(m.userId) === String(token.userId));
    if (!user || !memberCanSubmit(member)) {
      return finish({ outcome: 'forbidden', reason: 'membership', status: 403, code: 'forbidden' });
    }

    const recent = await IngestEvent.countDocuments({
      tokenId: token._id,
      createdAt: { $gte: new Date(Date.now() - RATE.windowMs) },
    });
    if (recent >= RATE.max) {
      res.setHeader('Retry-After', String(RATE.windowMs / 1000));
      return error(res, 'rate_limited', 429);
    }

    const parsed = parse(req.body, { userCurrency: user.currency || 'USD' });
    if (!parsed.ok) {
      return finish({ outcome: 'rejected', reason: parsed.reason, status: 422, code: parsed.reason });
    }
    const ev = parsed.event;

    const cards = await Card.find({ workspaceId: workspace._id }).select('lastFourDigits walletName isActive').lean();
    const card = matchCard(cards, ev.cardText);
    ev.cardId = card ? String(card._id) : null;

    // Layer 1: the same request replayed, caught atomically by the unique partial index and checked up front.
    const key = dedupeKey({
      tokenId: String(token._id), source: kind, at: ev.at, minor: ev.minor, currency: ev.currency,
      merchantKey: ev.merchantKey, cardText: ev.cardText,
    });
    if (key) {
      const replay = await ExpenseTransaction.findOne({ workspaceId: workspace._id, dedupeKey: key }).select('_id').lean();
      if (replay) return finish({ outcome: 'duplicate', reason: 'replay', transactionId: replay._id, ev });
    }

    // Layer 2: does another report of this purchase already exist?
    const candidates = await ExpenseTransaction.find({
      workspaceId: workspace._id,
      type: 'Expense',
      currency: ev.currency,
      amount: { $gte: ev.amount - 0.0005, $lte: ev.amount + 0.0005 },
      date: { $gte: shiftDate(ev.date, -WINDOWS.statementDays), $lte: shiftDate(ev.date, WINDOWS.statementDays) },
    }).select(CANDIDATE_FIELDS).limit(25).lean();

    let decision = decideMatch(ev, candidates);
    if (decision.action === 'duplicate') {
      return finish({ outcome: 'duplicate', reason: decision.reason, transactionId: decision.target._id, ev });
    }

    if (decision.action === 'merge') {
      const { set, entry } = planMerge(decision.target, ev, { source: kind, tokenId: token._id });
      // The guard makes a row absorb each source once, even if two requests race.
      const merged = await ExpenseTransaction.findOneAndUpdate(
        { _id: decision.target._id, workspaceId: workspace._id, 'ingest.sources.source': { $ne: kind } },
        { $push: { 'ingest.sources': entry }, ...(Object.keys(set).length ? { $set: set } : {}) },
        { new: true }
      ).lean();
      if (merged) {
        const gapMs = decision.target.occurredAt ? Math.abs(new Date(decision.target.occurredAt) - ev.occurredAt) : undefined;
        return finish({ outcome: 'merged', reason: decision.reason, transactionId: merged._id, ev, gapMs });
      }
      decision = { action: 'flag', target: decision.target, reason: 'merge_race' };
    }

    // Pre-fill the category from the user's own history and keywords; the row stays pending for review.
    let category = 'other_expense';
    if (ev.merchant) {
      const [categories, history] = await Promise.all([
        Category.find({ workspaceId: workspace._id }).lean(),
        ExpenseTransaction.find({ workspaceId: workspace._id, type: 'Expense' }).sort('-date').limit(500).select('description category type').lean(),
      ]);
      category = suggestCategory({ description: ev.merchant, type: 'Expense', categories, history })?.name || category;
    }

    const flags = [...ev.flags];
    if (decision.action === 'flag') flags.push('possibleDuplicate');

    try {
      const row = await ExpenseTransaction.create({
        workspaceId: workspace._id,
        createdBy: user._id,
        created_by: user.email,
        type: 'Expense',
        status: 'pending',
        source: kind,
        amount: ev.amount,
        currency: ev.currency,
        // Same currency as the user's: nothing to convert. Otherwise left empty; the app converts when it shows or confirms it.
        amountInGlobalCurrency: ev.currency === user.currency ? ev.amount : null,
        category,
        description: ev.merchant,
        merchant: ev.merchant,
        merchantKey: ev.merchantKey,
        date: ev.date,
        occurredAt: ev.occurredAt,
        paymentMethod: 'Card',
        cardId: ev.cardId,
        dedupeKey: key ?? undefined,
        ingest: {
          sources: [{ source: kind, at: ev.occurredAt, tokenId: token._id, cardText: ev.cardText }],
          flags,
          ...(decision.action === 'flag' ? { duplicateOf: decision.target._id } : {}),
        },
      });
      return finish({
        outcome: decision.action === 'flag' ? 'flagged' : 'created',
        reason: decision.reason ?? '',
        transactionId: row._id,
        status: 201,
        ev,
      });
    } catch (err) {
      // A concurrent replay won the race on the unique index: report it as the duplicate it is.
      if (err?.code === 11000 && key) {
        const existing = await ExpenseTransaction.findOne({ workspaceId: workspace._id, dedupeKey: key }).select('_id').lean();
        return finish({ outcome: 'duplicate', reason: 'replay', transactionId: existing?._id ?? null, ev });
      }
      throw err;
    }
  } catch (err) {
    console.error('[Ingest] failed:', err?.message);
    return serverError(res, err);
  }
}
