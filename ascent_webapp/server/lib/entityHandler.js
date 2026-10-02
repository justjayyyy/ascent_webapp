import connectDB from './mongodb.js';
import { handleCors } from './cors.js';
import { success, error, notFound, forbidden, serverError } from './response.js';
import { authMiddleware } from '../middleware/auth.js';
import { isValidObjectId } from './validate.js';

const NEVER_FILTER = new Set(['workspaceId', 'createdBy', '_id', 'sort', 'limit', '_single', 'path', 'from', 'to', 'has']);
const DAY = /^\d{4}-\d{2}-\d{2}$/;
// Who added a row is the signed-in user, never what the client says (created_by is their email)
const NEVER_WRITE = new Set(['workspaceId', 'createdBy', 'created_by', '_id', 'id']);
const DEFAULT_LIMIT = 1000;
const MAX_LIMIT = 10000;

// Owners and admins may do anything in their workspace; everyone else needs the named member permission.
export function memberMay(req, user, permission) {
  if (!permission) return true;
  const member = req.member;
  if (!member) return false;
  if (member.role === 'owner' || member.role === 'admin') return true;
  if (req.workspace?.ownerId && req.workspace.ownerId.toString() === user._id.toString()) return true;
  return member.permissions?.[permission] === true;
}

// Only plain values for real schema fields become filters: no operators, no tenant fields.
function safeFilters(Model, filters) {
  const out = {};
  for (const [key, value] of Object.entries(filters)) {
    if (NEVER_FILTER.has(key) || key.startsWith('$') || key.includes('.')) continue;
    if (typeof value !== 'string' || !Model.schema?.path(key)) continue;
    out[key] = value;
  }
  return out;
}

/**
 * `from` / `to` (YYYY-MM-DD, inclusive) on the model's date field, and `has=<field>` for rows where a
 * real schema field is set. Returns the conditions, or { invalid } naming the bad parameter.
 */
export function rangeAndPresence(Model, query, dateField) {
  const out = {};
  if (query.from !== undefined || query.to !== undefined) {
    if (!dateField) return { invalid: 'from' };
    for (const k of ['from', 'to']) if (query[k] !== undefined && (typeof query[k] !== 'string' || !DAY.test(query[k]))) return { invalid: k };
    out[dateField] = {
      ...(query.from && { $gte: query.from }),
      // dates are stored as YYYY-MM-DD strings; anything after the day itself still sorts within it
      ...(query.to && { $lte: `${query.to}\uffff` }),
    };
  }
  if (query.has !== undefined) {
    const field = query.has;
    if (typeof field !== 'string' || NEVER_FILTER.has(field) || field.startsWith('$') || field.includes('.') || !Model.schema?.path(field)) return { invalid: 'has' };
    // An empty string means "not set" only for text fields (other types cannot even hold one)
    out[field] = Model.schema.path(field).instance === 'String' ? { $exists: true, $nin: [null, ''] } : { $exists: true, $ne: null };
  }
  return out;
}

// Rows queued on a device while offline carry an "app:<uuid>" dedupeKey, so a retried upload finds the
// row the first attempt already stored instead of adding it twice. Other keys belong to automation
// (Wallet, SMS, statements) and a client may not set them.
const APP_KEY = /^app:[\w-]{8,100}(:\d{1,4})?$/; // ":n" numbers the rows of one queued batch
function clientWritable(Model, item) {
  if (!item || typeof item !== 'object') return {};
  const out = {};
  for (const [k, v] of Object.entries(item)) {
    if (NEVER_WRITE.has(k) || k.startsWith('$')) continue;
    if (k === 'dedupeKey' && Model.schema?.path?.('dedupeKey') && !(typeof v === 'string' && APP_KEY.test(v))) continue;
    out[k] = v;
  }
  return out;
}

// Emails named in a row's people fields (options.people: field -> emails in its value)
function peopleIn(row, people) {
  const out = [];
  for (const [field, emailsOf] of Object.entries(people)) {
    if (row && row[field] != null) out.push(...emailsOf(row[field]));
  }
  return out.filter((e) => typeof e !== 'string' || e.trim()).map((e) => (typeof e === 'string' ? e.trim().toLowerCase() : e));
}
// The caller counts too, for workspaces whose owner row predates stored emails
const memberEmails = (workspace, user) => [
  ...(workspace.members || []).filter((m) => m.status === 'accepted' && m.email).map((m) => m.email.toLowerCase()),
  String(user.email || '').toLowerCase(),
];
const strangerIn = (row, people, allowed) => peopleIn(row, people).some((e) => typeof e !== 'string' || !allowed.has(e));

// One entry of a list field (plan items, loan payments), changed on its own so two people editing the
// same list at once do not overwrite each other. Entries are keyed by their string `id`.
const ENTRY_KEY = /^[A-Za-z_]\w{0,40}$/;
const plainEntry = (v) => v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).every((k) => ENTRY_KEY.test(k));
export async function changeListEntry(Model, filter, field, body) {
  const { op, id, item, changes, at } = body || {};
  const opts = { runValidators: true };
  const key = `${field}.id`;
  if (op === 'put') {
    if (!plainEntry(item) || typeof item.id !== 'string' || !item.id) return 'bad';
    const replace = () => Model.updateOne({ ...filter, [key]: item.id }, { $set: { [`${field}.$`]: item } }, opts);
    let r = await replace();
    if (r.matchedCount) return 'ok';
    const entry = Number.isInteger(at) && at >= 0 ? { $each: [item], $position: at } : item;
    r = await Model.updateOne({ ...filter, [key]: { $ne: item.id } }, { $push: { [field]: entry } }, opts);
    if (r.matchedCount) return 'ok';
    return (await replace()).matchedCount ? 'ok' : 'missing'; // someone else added the same id meanwhile
  }
  if (typeof id !== 'string' || !id) return 'bad';
  if (op === 'patch') {
    if (!plainEntry(changes) || 'id' in changes || !Object.keys(changes).length) return 'bad';
    const set = Object.fromEntries(Object.entries(changes).map(([k, v]) => [`${field}.$.${k}`, v]));
    return (await Model.updateOne({ ...filter, [key]: id }, { $set: set }, opts)).matchedCount ? 'ok' : 'missing';
  }
  if (op === 'remove') {
    return (await Model.updateOne(filter, { $pull: { [field]: { id } } })).matchedCount ? 'ok' : 'missing';
  }
  return 'bad';
}

const isDuplicate = (err) => err?.code === 11000 || err?.writeErrors?.some?.((e) => e.code === 11000 || e.err?.code === 11000);

/** A plain object with a string `id`, from a document or a lean row. */
export function toPlain(doc) {
  if (!doc) return doc;
  const obj = typeof doc.toJSON === 'function' ? doc.toJSON() : doc;
  return obj.id || !obj._id ? obj : { ...obj, id: obj._id.toString() };
}

// Mongoose rejections that are the caller's fault, not ours
function clientFault(res, err) {
  if (err?.name === 'ValidationError') {
    const details = Object.values(err.errors || {}).map((e) => e.message).join(', ');
    return error(res, `Validation error: ${details}`, 400);
  }
  if (err?.name === 'CastError') return error(res, `Invalid value for ${err.path}`, 400);
  return null;
}

/**
 * Generic CRUD for a workspace-scoped model.
 * options.permission: { read, write } member permission names (see the Workspace model), e.g. { read: 'viewExpenses', write: 'editExpenses' }
 * options.checkSharing: members other than the owner only see rows they created or that are marked isShared
 * options.dateField: the YYYY-MM-DD field that `from` / `to` list filters apply to
 * options.people: fields that name people by email, as { field: (value) => emails }. Each must be a member
 *   of the workspace, so nobody can pin money on an outsider; on edits, people already on the row stay allowed
 *   (someone who has since left).
 * options.lists: array fields whose entries can be changed one at a time with PATCH ?id=&list=<field> and a body
 *   { op: 'put', item, at? } (add or replace by item.id), { op: 'patch', id, changes } or { op: 'remove', id }
 */
export function createEntityHandler(Model, options = {}) {
  const { checkSharing = false, permission = null, dateField = null, people = null, lists = [] } = options;
  const authored = !!Model.schema?.path?.('created_by');
  const entityName = Model.modelName || 'Entity';

  return async function handler(req, res) {
    if (handleCors(req, res)) return;

    try {
      const user = await authMiddleware(req, res);
      if (!user) return;

      // Every request is scoped to a workspace the caller belongs to; auth sets req.workspace only for members.
      if (!req.workspace) {
        return req.headers['x-workspace-id']
          ? forbidden(res, 'Not a member of this workspace')
          : error(res, 'Workspace context required', 400);
      }
      const { method } = req;
      const needed = permission ? (method === 'GET' ? permission.read : permission.write) : null;
      if (!memberMay(req, user, needed)) return forbidden(res, 'You do not have permission for this action');

      const rawId = req.query.id;
      if (rawId !== undefined && !isValidObjectId(rawId)) return error(res, 'Invalid id', 400);
      const id = rawId;

      await connectDB();

      const scope = { workspaceId: req.workspace._id };
      const isOwner = req.workspace.ownerId && req.workspace.ownerId.toString() === user._id.toString();
      if (checkSharing && !isOwner) scope.$or = [{ createdBy: user._id }, { isShared: true }];

      switch (method) {
        case 'GET': {
          if (req.query._single === 'true' && id) {
            const item = await Model.findOne({ _id: id, ...scope }).lean();
            return item ? success(res, toPlain(item)) : notFound(res, 'Item not found');
          }

          const { sort = '-created_date', limit, ...filters } = req.query;
          const extra = rangeAndPresence(Model, req.query, dateField);
          if (extra.invalid) return error(res, `Invalid ${extra.invalid}`, 400);
          const query = { ...scope, ...safeFilters(Model, filters), ...extra };
          if (id) query._id = id;
          const sortField = typeof sort === 'string' && /^-?[A-Za-z_]+$/.test(sort) ? sort : '-created_date';
          const limitValue = Math.min(Math.max(parseInt(limit, 10) || DEFAULT_LIMIT, 1), MAX_LIMIT);

          // Rows with the same value (several on one day) come newest first, and always in the same order
          const order = /^-?_id$/.test(sortField) ? sortField : `${sortField} -_id`;
          const items = await Model.find(query).sort(order).limit(limitValue).lean();
          return success(res, items.map(toPlain));
        }

        case 'POST': {
          const body = req.body;
          const isBatch = Array.isArray(body);
          if (!body || typeof body !== 'object' || (isBatch ? body.length === 0 : Object.keys(body).length === 0)) {
            return error(res, 'Request body is required', 400);
          }
          const stamp = (item) => ({
            ...clientWritable(Model, item),
            workspaceId: req.workspace._id,
            createdBy: user._id,
            ...(authored ? { created_by: user.email } : {}),
          });
          if (people) {
            const allowed = new Set(memberEmails(req.workspace, user));
            if ((isBatch ? body : [body]).some((item) => strangerIn(item, people, allowed))) {
              return error(res, 'Only members of this workspace can be named on a row', 400);
            }
          }

          if (isBatch) {
            const rows = body.map(stamp);
            try {
              const created = await Model.insertMany(rows);
              return success(res, created.map(toPlain), 201);
            } catch (err) {
              // A retried offline upload: return what is already stored and add only what is missing
              const keys = rows.map((r) => r.dedupeKey).filter((k) => typeof k === 'string');
              if (isDuplicate(err) && keys.length === rows.length) {
                const stored = await Model.find({ workspaceId: req.workspace._id, dedupeKey: { $in: keys } }).lean();
                const have = new Set(stored.map((d) => d.dedupeKey));
                const missing = rows.filter((r) => !have.has(r.dedupeKey));
                const added = missing.length ? await Model.insertMany(missing) : [];
                const byKey = new Map([...stored, ...added].map(toPlain).map((d) => [d.dedupeKey, d]));
                return success(res, keys.map((k) => byKey.get(k)).filter(Boolean), 200);
              }
              throw err;
            }
          }

          const row = stamp(body);
          try {
            return success(res, toPlain(await Model.create(row)), 201);
          } catch (err) {
            // A retried offline upload whose first attempt got through: answer with that row
            if (isDuplicate(err) && typeof row.dedupeKey === 'string') {
              const stored = await Model.findOne({ workspaceId: req.workspace._id, dedupeKey: row.dedupeKey }).lean();
              if (stored) return success(res, toPlain(stored), 200);
            }
            throw err;
          }
        }

        case 'PUT':
        case 'PATCH': {
          if (!id) return error(res, 'ID is required for update. Provide ?id=... in URL', 400);
          if (req.query.list !== undefined) {
            if (method !== 'PATCH' || !lists.includes(req.query.list)) return error(res, 'Unknown list', 400);
            const outcome = await changeListEntry(Model, { _id: id, ...scope }, req.query.list, req.body);
            if (outcome === 'bad') return error(res, 'Invalid list change', 400);
            if (outcome === 'missing') return notFound(res, 'Item not found');
            const item = await Model.findOne({ _id: id, ...scope }).lean();
            return item ? success(res, toPlain(item)) : notFound(res, 'Item not found');
          }
          const changes = clientWritable(Model, req.body);
          if (Object.keys(changes).length === 0) return error(res, 'Update data is required in request body', 400);
          if (people && peopleIn(changes, people).length) {
            const current = await Model.findOne({ _id: id, ...scope }).lean();
            if (!current) return notFound(res, 'Item not found');
            const allowed = new Set([...memberEmails(req.workspace, user), ...peopleIn(current, people)]);
            if (strangerIn(changes, people, allowed)) return error(res, 'Only members of this workspace can be named on a row', 400);
          }
          const item = await Model.findOneAndUpdate({ _id: id, ...scope }, changes, { new: true, runValidators: true }).lean();
          // Same answer whether the row is missing or belongs to someone else: no probing other workspaces
          return item ? success(res, toPlain(item)) : notFound(res, 'Item not found');
        }

        case 'DELETE': {
          if (!id) return error(res, 'ID is required for delete. Provide ?id=... in URL', 400);
          const item = await Model.findOneAndDelete({ _id: id, ...scope }).lean();
          return item ? success(res, { deleted: true, id: item._id.toString() }) : notFound(res, 'Item not found');
        }

        default:
          return error(res, 'Method not allowed', 405);
      }
    } catch (err) {
      const handled = clientFault(res, err);
      if (handled) return handled;
      console.error(`[EntityHandler] ${req.method} ${entityName}:`, err?.message);
      return serverError(res, err);
    }
  };
}
