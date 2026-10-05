import mongoose from 'mongoose';
import Receipt from '../models/Receipt.js';
import connectDB from '../lib/mongodb.js';
import { handleCors } from '../lib/cors.js';
import { success, error, notFound, forbidden, serverError } from '../lib/response.js';
import { authMiddleware } from '../middleware/auth.js';
import { fileBytes } from './notes.js';
import { cleanReceiptLines } from '../lib/receiptLines.js';

// The receipts vault: photos and PDFs of the household's receipts, for returns, warranties and checking
// what something cost. Like the shopping list, every member of the household can see and add to it.
//   GET                          the list, without the files
//   GET    ?id=<id>&part=file    the file itself (base64), or part=thumb for the small preview
//   POST   { type, data, thumb?, name?, store?, date?, total?, currency?, note?, read?, items? }
//   PATCH  ?id=<id>  { store?, date?, total?, currency?, note?, read?, items? }
// items: what was bought, line by line: [{ text, qty, unit, unitPrice, price }]
//   DELETE ?id=<id>  whoever added it, or an owner or admin

const MAX_FILE_BYTES = 3 * 1024 * 1024; // base64 in JSON stays under Vercel's 4.5 MB body limit
const MAX_THUMB_BYTES = 120 * 1024;
const TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const LIST_FIELDS = '-data -thumb';

function present(row) {
  const { _id, data: _data, thumb, workspaceId: _w, __v: _v, ...rest } = row;
  return {
    ...rest,
    id: _id.toString(),
    createdBy: row.createdBy ? row.createdBy.toString() : null,
    hasThumb: thumb === undefined ? !!rest.hasThumb : !!thumb,
  };
}

// The fields people can type, cleaned; only those that were sent
function details(body) {
  const set = {};
  if (typeof body.store === 'string') set.store = body.store.trim().slice(0, 80);
  if (typeof body.note === 'string') set.note = body.note.trim().slice(0, 300);
  if (body.date !== undefined) set.date = typeof body.date === 'string' && DAY.test(body.date) ? body.date : '';
  if (body.total !== undefined) {
    const n = typeof body.total === 'number' ? body.total : parseFloat(body.total);
    set.total = Number.isFinite(n) && n >= 0 && n < 1e7 ? Math.round(n * 100) / 100 : null;
  }
  if (body.currency !== undefined) set.currency = typeof body.currency === 'string' && /^[A-Z]{3}$/.test(body.currency) ? body.currency : null;
  if (typeof body.read === 'boolean') set.read = body.read;
  if (Array.isArray(body.items)) set.items = cleanReceiptLines(body.items);
  return set;
}

const decode = (b64) => (typeof b64 === 'string' && b64 && BASE64.test(b64) ? Buffer.from(b64, 'base64') : null);

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  try {
    const user = await authMiddleware(req, res);
    if (!user) return;
    await connectDB();

    const workspace = req.workspace;
    if (!workspace) return error(res, 'Workspace context required', 400);
    const member = req.member;
    const isAdmin = member && (member.role === 'owner' || member.role === 'admin');

    const { id, part } = req.query;
    if (id !== undefined && !mongoose.isValidObjectId(id)) return error(res, 'A valid receipt id is required', 400);
    const mine = { workspaceId: workspace._id };

    switch (req.method) {
      case 'GET': {
        if (id) {
          const wantThumb = part === 'thumb';
          const row = await Receipt.findOne({ _id: id, ...mine }).select(wantThumb ? 'thumb type' : 'data type name').lean();
          if (!row) return notFound(res, 'Receipt not found');
          const bytes = wantThumb ? row.thumb : row.data;
          if (!bytes) return notFound(res, 'No preview');
          return success(res, {
            id,
            type: wantThumb ? 'image/jpeg' : row.type,
            name: row.name,
            data: fileBytes(bytes).toString('base64'),
          });
        }
        const rows = await Receipt.aggregate([
          { $match: mine },
          { $sort: { date: -1, created_date: -1 } },
          { $limit: 2000 },
          { $addFields: { hasThumb: { $gt: ['$thumb', null] } } },
          { $project: { data: 0, thumb: 0 } },
        ]);
        return success(res, rows.map(present));
      }

      case 'POST': {
        const body = req.body || {};
        const type = TYPES.has(body.type) ? body.type : null;
        if (!type) return error(res, 'Only photos (JPEG, PNG, WebP) and PDFs can be kept', 400);
        const bytes = decode(body.data);
        if (!bytes?.length) return error(res, 'File data is required', 400);
        if (bytes.length > MAX_FILE_BYTES) return error(res, 'File is too large (max 3 MB)', 413);
        const thumb = type.startsWith('image/') ? decode(body.thumb) : null;
        const row = await Receipt.create({
          ...details(body),
          name: String(body.name || 'receipt').slice(0, 200),
          type,
          size: bytes.length,
          data: bytes,
          thumb: thumb && thumb.length <= MAX_THUMB_BYTES ? thumb : null,
          addedBy: String(user.email || '').toLowerCase().slice(0, 120),
          workspaceId: workspace._id,
          createdBy: user._id,
        });
        return success(res, present(row.toObject()), 201);
      }

      case 'PUT':
      case 'PATCH': {
        if (!id) return error(res, 'A valid receipt id is required', 400);
        const set = details(req.body || {});
        if (!Object.keys(set).length) return error(res, 'Nothing to update', 400);
        const row = await Receipt.findOneAndUpdate({ _id: id, ...mine }, { $set: set }, { new: true, runValidators: true })
          .select(LIST_FIELDS).lean();
        if (!row) return notFound(res, 'Receipt not found');
        const withThumb = await Receipt.exists({ _id: id, thumb: { $ne: null } });
        return success(res, present({ ...row, hasThumb: !!withThumb }));
      }

      case 'DELETE': {
        if (!id) return error(res, 'A valid receipt id is required', 400);
        const row = await Receipt.findOne({ _id: id, ...mine }).select('createdBy').lean();
        if (!row) return notFound(res, 'Receipt not found');
        if (!isAdmin && String(row.createdBy) !== String(user._id)) return forbidden(res, 'Only whoever added a receipt can delete it');
        await Receipt.deleteOne({ _id: id, ...mine });
        return success(res, { deleted: true, id });
      }

      default:
        return error(res, 'Method not allowed', 405);
    }
  } catch (err) {
    if (err.name === 'ValidationError') {
      return error(res, `Validation error: ${Object.values(err.errors || {}).map(e => e.message).join(', ')}`, 400);
    }
    console.error('[Receipts] error:', err);
    return serverError(res, err);
  }
}
