import mongoose from 'mongoose';
import Note from '../models/Note.js';
import NoteFile from '../models/NoteFile.js';
import connectDB from '../lib/mongodb.js';
import { handleCors } from '../lib/cors.js';
import { success, error, notFound, serverError } from '../lib/response.js';
import { authMiddleware } from '../middleware/auth.js';
import { mergeChecklist } from '../lib/checklistMerge.js';
import { aiConfigured, AssistantDeclined } from '../lib/assistant.js';
import { readDocumentPages, MAX_PAGES_PER_CALL } from '../lib/noteImport.js';

const TRASH_DAYS = 7;
const MAX_ITEMS = 500;
const MAX_TAGS = 30;
const MAX_TEXT = 100_000;
const MAX_FILES = 10;
const MAX_FILE_BYTES = 3 * 1024 * 1024; // base64 in JSON stays under Vercel's 4.5 MB body limit

const REPEATS = ['none', 'daily', 'weekly', 'monthly', 'yearly'];
const LINE_KINDS = ['text', 'title', 'number', 'callout', 'image']; // besides an ordinary tickable item, which stores no kind
const PRICED_KINDS = [null, 'text', 'number']; // the lines that may carry an amount (null: a tickable item)

const sameId = (a, b) => a && b && a.toString() === b.toString();

// Reading documents into notes uses the assistant: a few pages per call, a limited number of calls per person
const IMPORT_LIMIT = { windowMs: 60 * 60_000, max: 30 };
const importCalls = new Map();
const PAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_IMPORT_CHARS = 4_200_000; // the pages' base64 together, under Vercel's 4.5 MB body limit
const LANGUAGES = { en: 'English', he: 'Hebrew', ru: 'Russian' };

function importRateLimited(userId) {
  const now = Date.now();
  const recent = (importCalls.get(userId) || []).filter((t) => now - t < IMPORT_LIMIT.windowMs);
  if (recent.length >= IMPORT_LIMIT.max) return true;
  recent.push(now);
  importCalls.set(userId, recent);
  return false;
}

// The stored bytes, exactly. A lean read gives a BSON Binary (its .buffer is the data); a Node Buffer
// must be used as it is, because its .buffer is the whole shared memory pool it was cut from.
export function fileBytes(data) {
  if (Buffer.isBuffer(data)) return data;
  const exactly = (view) => Buffer.from(view.buffer, view.byteOffset, view.byteLength);
  if (ArrayBuffer.isView(data)) return exactly(data);
  if (ArrayBuffer.isView(data?.buffer)) return exactly(data.buffer); // BSON Binary
  return Buffer.from(data?.buffer ?? data ?? []);
}

// What the caller may do with a note:
//   'owner' created it, 'edit' can change its content, 'view' can only read, null: no access
export function accessFor(note, user, member) {
  if (sameId(note.createdBy, user._id)) return 'owner';

  const collab = (note.collaborators || []).find(c => sameId(c.userId, user._id));
  if (collab) return collab.role === 'editor' ? 'edit' : 'view';

  if (note.isShared && member) {
    if (member.role === 'owner' || member.role === 'admin') return 'edit';
    if (member.permissions?.editNotes) return 'edit';
    if (member.permissions?.viewNotes) return 'view';
  }
  return null;
}

// The shape the client sees: pin/archive are resolved for the caller, and the
// audience lists are only shown to people who can manage sharing.
function present(note, user, member) {
  const uid = user._id;
  const access = accessFor(note, user, member);
  const pinned = (note.pinnedBy || []).some(id => sameId(id, uid)) ||
    (sameId(note.createdBy, uid) && !!note.isPinned);
  const { pinnedBy, archivedBy, isPinned, reminders, ...rest } = note;
  const mine = (reminders || []).find(r => sameId(r.userId, uid));
  return {
    ...rest,
    id: note._id.toString(),
    updatedBy: note.updatedBy ? note.updatedBy.toString() : null,
    isPinned: pinned,
    isArchived: (archivedBy || []).some(id => sameId(id, uid)),
    reminder: mine ? new Date(mine.at).toISOString() : null,
    reminderRepeat: mine?.repeat || 'none',
    myAccess: access,
    collaborators: (note.collaborators || []).map(c => ({
      userId: c.userId.toString(), email: c.email, role: c.role
    })),
    items: (note.items || []).map(presentLine),
    attachments: (note.attachments || []).map(({ id, name, type, size }) => ({ id, name, type, size }))
  };
}

// The extras a line keeps: an amount (with its currency) on items, text and numbered lines, a file on a picture
function lineExtras(it, kind) {
  const out = {};
  const amount = Number(it?.amount);
  if (PRICED_KINDS.includes(kind) && it?.amount !== null && it?.amount !== undefined && it?.amount !== '' && Number.isFinite(amount)) {
    out.amount = Math.round(amount * 100) / 100;
    if (typeof it.currency === 'string' && /^[A-Z]{3}$/.test(it.currency)) out.currency = it.currency;
  }
  if (kind === 'image' && typeof it?.fileId === 'string' && /^[0-9a-f]{24}$/.test(it.fileId)) out.fileId = it.fileId;
  return out;
}

function presentLine({ id, text, done, kind, ...rest }) {
  const k = LINE_KINDS.includes(kind) ? kind : null;
  return { id, text, done: !!done, ...(k ? { kind: k } : {}), ...lineExtras(rest, k) };
}

function cleanItems(items) {
  if (!Array.isArray(items)) return null;
  return items.slice(0, MAX_ITEMS).map((it, i) => {
    const kind = LINE_KINDS.includes(it?.kind) ? it.kind : null;
    return {
      id: String(it?.id || `i${Date.now().toString(36)}${i}`).slice(0, 40),
      text: String(it?.text ?? '').slice(0, 2000),
      // Only items are ticked
      done: !kind && !!it?.done,
      ...(kind ? { kind } : {}),
      ...lineExtras(it, kind)
    };
  });
}

function cleanTags(tags) {
  if (!Array.isArray(tags)) return null;
  const seen = new Set();
  const out = [];
  for (const raw of tags) {
    const tag = String(raw ?? '').trim().slice(0, 40);
    const key = tag.toLowerCase();
    if (tag && !seen.has(key)) { seen.add(key); out.push(tag); }
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}

const validColor = (c) => typeof c === 'string' && (/^[a-z]{2,12}$/.test(c) || /^#[0-9a-fA-F]{6}$/.test(c));

// Content fields anyone with edit access may change
function contentPatch(body) {
  const set = {};
  if (typeof body.title === 'string') set.title = body.title.slice(0, 500);
  if (typeof body.content === 'string') set.content = body.content.slice(0, MAX_TEXT);
  if (body.type === 'text' || body.type === 'checklist') set.type = body.type;
  if (body.items !== undefined) {
    const items = cleanItems(body.items);
    if (items) set.items = items;
  }
  if (body.tags !== undefined) {
    const tags = cleanTags(body.tags);
    if (tags) set.tags = tags;
  }
  if (body.color !== undefined && validColor(body.color)) set.color = body.color;
  return set;
}

// Turn the client's requested audience into a verified collaborator list.
// Only accepted members of this workspace (other than the caller) can be added.
function buildCollaborators(requested, workspace, user) {
  if (!Array.isArray(requested)) return null;
  const out = [];
  const seen = new Set();
  for (const entry of requested) {
    const member = (workspace.members || []).find(m =>
      m.userId && sameId(m.userId, entry?.userId) && m.status !== 'rejected');
    if (!member || sameId(member.userId, user._id) || seen.has(member.userId.toString())) continue;
    seen.add(member.userId.toString());
    out.push({
      userId: member.userId,
      email: member.email,
      role: entry.role === 'editor' ? 'editor' : 'viewer'
    });
  }
  return out;
}

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  try {
    const user = await authMiddleware(req, res);
    if (!user) return;

    await connectDB();

    const workspace = req.workspace;
    if (!workspace) return error(res, 'Workspace context required', 400);
    // Invited people who already have an account are linked to the workspace straight away
    // (the rest of the app lets them in), so only declined invitations are shut out.
    const member = req.member && req.member.status !== 'rejected' ? req.member : null;
    const isAdmin = member && (member.role === 'owner' || member.role === 'admin');
    const canCreate = isAdmin || !!member?.permissions?.editNotes;

    const { id, action, _single } = req.query;
    const uid = user._id;

    // ---- reading a document: POST ?action=import { pages: [{ data, mediaType }], pictures, firstPage, pageCount } ----
    // -> { title, lines }: the note's lines for these pages; the app creates the note and uploads the pictures
    if (action === 'import') {
      if (req.method !== 'POST') return error(res, 'Method not allowed', 405);
      if (!canCreate) return error(res, 'You do not have permission to create notes', 403);
      if (!aiConfigured() || workspace.settings?.aiAssistant !== true) return error(res, 'ai_disabled', 403);
      const body = req.body || {};
      const pages = Array.isArray(body.pages) ? body.pages : [];
      if (!pages.length || pages.length > MAX_PAGES_PER_CALL) return error(res, `Send 1 to ${MAX_PAGES_PER_CALL} pages at a time`, 400);
      if (pages.some((p) => typeof p?.data !== 'string' || !p.data || !PAGE_TYPES.has(p.mediaType))) return error(res, 'Pages must be JPEG, PNG or WebP images', 400);
      if (pages.reduce((n, p) => n + p.data.length, 0) > MAX_IMPORT_CHARS) return error(res, 'The pages are too large', 413);
      const pictures = (Array.isArray(body.pictures) ? body.pictures : []).slice(0, 40)
        .map((p) => ({ ref: Number(p?.ref), page: Number(p?.page), width: Number(p?.width) || 0, height: Number(p?.height) || 0 }))
        .filter((p) => Number.isInteger(p.ref) && p.ref > 0 && Number.isInteger(p.page));
      if (importRateLimited(uid.toString())) return error(res, 'Too many documents read this hour. Try again later.', 429);
      try {
        const doc = await readDocumentPages({
          pages: pages.map((p) => ({ data: p.data, mediaType: p.mediaType })),
          pictures,
          firstPage: Math.max(1, Number(body.firstPage) || 1),
          pageCount: Math.max(0, Number(body.pageCount) || 0) || undefined,
          language: LANGUAGES[user.language] || LANGUAGES[body.language],
        });
        return success(res, doc);
      } catch (err) {
        if (err instanceof AssistantDeclined) return error(res, 'declined', 422);
        console.error('[Notes] import failed:', err?.message);
        return error(res, 'The document could not be read. Try again.', 502);
      }
    }

    // ---- file attachments: ?action=file&id=<noteId>[&fileId=<fileId>] ----
    if (action === 'file') {
      if (!id || !mongoose.isValidObjectId(id)) return error(res, 'A valid note id is required', 400);
      const note = await Note.findOne({ _id: id, workspaceId: workspace._id }).lean();
      const access = note && accessFor(note, user, member);
      if (!access) return notFound(res, 'Note not found');
      const canEditNote = (access === 'owner' || access === 'edit') && !note.trashedAt;
      const { fileId } = req.query;

      if (req.method === 'GET') {
        if (!fileId || !mongoose.isValidObjectId(fileId)) return error(res, 'A valid file id is required', 400);
        const file = await NoteFile.findOne({ _id: fileId, noteId: id }).lean();
        if (!file) return notFound(res, 'File not found');
        return success(res, {
          id: file._id.toString(), name: file.name, type: file.type, size: file.size,
          data: fileBytes(file.data).toString('base64')
        });
      }

      if (!canEditNote) return error(res, 'You can only view this note', 403);

      if (req.method === 'POST') {
        const { name, type, data } = req.body || {};
        if (typeof data !== 'string' || !data) return error(res, 'File data is required', 400);
        if ((note.attachments || []).length >= MAX_FILES) return error(res, `Up to ${MAX_FILES} files per note`, 400);
        const bytes = Buffer.from(data, 'base64');
        if (!bytes.length) return error(res, 'File is empty', 400);
        if (bytes.length > MAX_FILE_BYTES) return error(res, 'File is too large (max 3 MB)', 413);
        const file = await NoteFile.create({
          noteId: id, workspaceId: workspace._id,
          name: String(name || 'file').slice(0, 200),
          type: String(type || 'application/octet-stream').slice(0, 100),
          size: bytes.length, data: bytes, uploadedBy: uid
        });
        const updated = await Note.findOneAndUpdate(
          { _id: id },
          {
            $push: { attachments: { id: file._id.toString(), name: file.name, type: file.type, size: file.size } },
            $set: { updatedByEmail: user.email, updatedBy: uid }
          },
          { new: true }
        ).lean();
        return success(res, present(updated, user, member), 201);
      }

      if (req.method === 'DELETE') {
        if (!fileId || !mongoose.isValidObjectId(fileId)) return error(res, 'A valid file id is required', 400);
        await NoteFile.deleteOne({ _id: fileId, noteId: id });
        const updated = await Note.findOneAndUpdate(
          { _id: id },
          { $pull: { attachments: { id: fileId } }, $set: { updatedByEmail: user.email, updatedBy: uid } },
          { new: true }
        ).lean();
        return success(res, present(updated, user, member));
      }

      return error(res, 'Method not allowed', 405);
    }

    switch (req.method) {
      case 'GET': {
        // Purge notes that have been in the trash past the grace period
        const cutoff = new Date(Date.now() - TRASH_DAYS * 86400000);
        const expired = await Note.find({ workspaceId: workspace._id, trashedAt: { $ne: null, $lt: cutoff } }).select('_id').lean();
        if (expired.length) {
          const ids = expired.map(n => n._id);
          await NoteFile.deleteMany({ noteId: { $in: ids } });
          await Note.deleteMany({ _id: { $in: ids } });
        }

        if (_single === 'true' && id) {
          if (!mongoose.isValidObjectId(id)) return notFound(res, 'Note not found');
          const note = await Note.findOne({ _id: id, workspaceId: workspace._id }).lean();
          if (!note || !accessFor(note, user, member)) return notFound(res, 'Note not found');
          return success(res, present(note, user, member));
        }

        const notes = await Note.find({
          workspaceId: workspace._id,
          $or: [{ createdBy: uid }, { 'collaborators.userId': uid }, { isShared: true }]
        }).sort('-updated_date').limit(2000).lean();

        return success(res, notes
          .filter(n => accessFor(n, user, member))
          .map(n => present(n, user, member)));
      }

      case 'POST': {
        if (!canCreate) return error(res, 'You do not have permission to create notes', 403);
        const body = req.body || {};
        if (Array.isArray(body)) return error(res, 'Bulk create is not supported', 400);

        // The client picks the id so a note created offline keeps it, and a retried
        // create (timeout, flaky connection) returns the same note instead of a duplicate.
        let _id;
        if (body.id && mongoose.isValidObjectId(body.id)) {
          const existing = await Note.findById(body.id).lean();
          if (existing) {
            if (sameId(existing.createdBy, uid) && sameId(existing.workspaceId, workspace._id)) {
              return success(res, present(existing, user, member));
            }
            return error(res, 'Note id already in use', 409);
          }
          _id = body.id;
        }

        const data = contentPatch(body);
        const collaborators = buildCollaborators(body.collaborators, workspace, user) || [];
        const note = await Note.create({
          ...(_id ? { _id } : {}),
          title: '',
          ...data,
          collaborators,
          isShared: body.isShared === undefined ? true : !!body.isShared,
          pinnedBy: body.isPinned ? [uid] : [],
          archivedBy: body.isArchived ? [uid] : [],
          isPinned: !!body.isPinned,
          updatedByEmail: user.email,
          updatedBy: uid,
          workspaceId: workspace._id,
          createdBy: uid
        });
        return success(res, present(note.toObject(), user, member), 201);
      }

      case 'PUT':
      case 'PATCH': {
        if (!id || !mongoose.isValidObjectId(id)) return error(res, 'A valid note id is required', 400);
        const body = req.body || {};
        if (!Object.keys(body).length) return error(res, 'Update data is required', 400);

        const note = await Note.findOne({ _id: id, workspaceId: workspace._id }).lean();
        if (!note) return notFound(res, 'Note not found');
        const access = accessFor(note, user, member);
        if (!access) return notFound(res, 'Note not found');

        const update = {};
        const set = {};
        const isOwner = access === 'owner';
        const canEditContent = access === 'owner' || access === 'edit';
        const wantsContent = ['title', 'content', 'type', 'items', 'tags', 'color']
          .some(k => body[k] !== undefined);

        // Every check comes before the first write, so a refused request changes nothing
        const wantsOwnerOnly = body.isShared !== undefined || body.collaborators !== undefined || body.trashed !== undefined;
        if (wantsOwnerOnly && !isOwner) return error(res, 'Only the note owner can do that', 403);
        if (wantsContent && !canEditContent) return error(res, 'You can only view this note', 403);
        const reminderAt = body.reminder ? new Date(body.reminder) : null;
        if (reminderAt && Number.isNaN(reminderAt.getTime())) return error(res, 'Invalid reminder time', 400);

        if (wantsContent) {
          Object.assign(set, contentPatch(body));
          set.updatedByEmail = user.email;
          set.updatedBy = uid;
        }

        // Personal state: any collaborator, including view-only ones
        if (typeof body.isPinned === 'boolean') {
          update[body.isPinned ? '$addToSet' : '$pull'] = {
            ...(update[body.isPinned ? '$addToSet' : '$pull'] || {}),
            pinnedBy: uid
          };
          if (isOwner) set.isPinned = body.isPinned;
        }
        if (typeof body.isArchived === 'boolean') {
          const op = body.isArchived ? '$addToSet' : '$pull';
          update[op] = { ...(update[op] || {}), archivedBy: uid };
        }

        // Reminders are personal too. $pull and $push can't share one update on the same
        // field, so the old reminder is cleared first.
        if (body.reminder !== undefined) {
          await Note.updateOne({ _id: id }, { $pull: { reminders: { userId: uid } } }, { timestamps: false });
          const repeat = REPEATS.includes(body.reminderRepeat) ? body.reminderRepeat : 'none';
          if (reminderAt) update.$push = { ...(update.$push || {}), reminders: { userId: uid, at: reminderAt, repeat } };
          else if (!Object.keys(set).length && !Object.keys(update).length) {
            const cleared = await Note.findById(id).lean();
            return success(res, present(cleared, user, member));
          }
        }

        // Sharing and trash belong to the creator
        if (wantsOwnerOnly) {
          if (body.isShared !== undefined) set.isShared = !!body.isShared;
          if (body.collaborators !== undefined) {
            const collaborators = buildCollaborators(body.collaborators, workspace, user);
            if (collaborators) set.collaborators = collaborators;
          }
          if (body.trashed !== undefined) set.trashedAt = body.trashed ? new Date() : null;
        }

        if (!Object.keys(set).length && !Object.keys(update).length) {
          return error(res, 'Nothing to update', 400);
        }
        if (Object.keys(set).length) update.$set = set;
        // Pinning, archiving or a reminder is personal: it shouldn't show up as an edit to everyone else
        const personalOnly = !wantsContent && !wantsOwnerOnly;

        // A checklist edit sent with the list it started from is merged into the list as it is now, so
        // people ticking different items at once keep both. The write only lands if nobody saved in between.
        const base = Array.isArray(body.itemsBase) && set.items ? cleanItems(body.itemsBase) : null;
        let current = note;
        for (let attempt = 0; attempt < 3; attempt += 1) {
          const filter = { _id: id, workspaceId: workspace._id };
          if (base) {
            set.items = mergeChecklist(base, cleanItems(body.items), cleanItems(current.items || []));
            filter.updated_date = current.updated_date;
          }
          const updated = await Note.findOneAndUpdate(filter, update, { new: true, runValidators: true, timestamps: !personalOnly }).lean();
          if (updated) return success(res, present(updated, user, member));
          if (!base) break;
          current = await Note.findOne({ _id: id, workspaceId: workspace._id }).lean();
          if (!current) break;
        }
        return base && current ? error(res, 'The note changed meanwhile. Try again.', 409) : notFound(res, 'Note not found');
      }

      case 'DELETE': {
        // Empty the caller's trash
        if (action === 'empty-trash') {
          const mine = await Note.find({ workspaceId: workspace._id, createdBy: uid, trashedAt: { $ne: null } }).select('_id').lean();
          const ids = mine.map(n => n._id);
          await NoteFile.deleteMany({ noteId: { $in: ids } });
          const result = await Note.deleteMany({ _id: { $in: ids } });
          return success(res, { deleted: true, count: result.deletedCount });
        }

        if (!id || !mongoose.isValidObjectId(id)) return error(res, 'A valid note id is required', 400);
        const note = await Note.findOne({ _id: id, workspaceId: workspace._id }).lean();
        if (!note) return notFound(res, 'Note not found');
        const access = accessFor(note, user, member);
        if (!access) return notFound(res, 'Note not found');

        // Someone the note was shared with can leave it; the creator deletes it for good
        if (access !== 'owner') {
          const isCollaborator = (note.collaborators || []).some(c => sameId(c.userId, uid));
          if (!isCollaborator) return error(res, 'Only the note owner can delete it', 403);
          await Note.updateOne({ _id: id }, { $pull: { collaborators: { userId: uid }, pinnedBy: uid, archivedBy: uid } });
          return success(res, { left: true, id });
        }

        await NoteFile.deleteMany({ noteId: id });
        await Note.deleteOne({ _id: id });
        return success(res, { deleted: true, id });
      }

      default:
        return error(res, 'Method not allowed', 405);
    }
  } catch (err) {
    if (err.name === 'ValidationError') {
      return error(res, `Validation error: ${Object.values(err.errors || {}).map(e => e.message).join(', ')}`, 400);
    }
    console.error('[Notes] error:', err);
    return serverError(res, err);
  }
}
