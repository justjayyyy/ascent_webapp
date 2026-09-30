import mongoose from 'mongoose';
import Note from '../models/Note.js';
import NoteFile from '../models/NoteFile.js';
import connectDB from '../lib/mongodb.js';
import { handleCors } from '../lib/cors.js';
import { success, error, notFound, serverError } from '../lib/response.js';
import { authMiddleware } from '../middleware/auth.js';

const TRASH_DAYS = 7;
const MAX_ITEMS = 500;
const MAX_TAGS = 30;
const MAX_TEXT = 100_000;
const MAX_FILES = 10;
const MAX_FILE_BYTES = 3 * 1024 * 1024; // base64 in JSON stays under Vercel's 4.5 MB body limit

const REPEATS = ['none', 'daily', 'weekly', 'monthly', 'yearly'];

const sameId = (a, b) => a && b && a.toString() === b.toString();

// What the caller may do with a note:
//   'owner' created it, 'edit' can change its content, 'view' can only read, null: no access
function accessFor(note, user, member) {
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
    isPinned: pinned,
    isArchived: (archivedBy || []).some(id => sameId(id, uid)),
    reminder: mine ? new Date(mine.at).toISOString() : null,
    reminderRepeat: mine?.repeat || 'none',
    myAccess: access,
    collaborators: (note.collaborators || []).map(c => ({
      userId: c.userId.toString(), email: c.email, role: c.role
    })),
    items: (note.items || []).map(({ id, text, done }) => ({ id, text, done: !!done })),
    attachments: (note.attachments || []).map(({ id, name, type, size }) => ({ id, name, type, size }))
  };
}

function cleanItems(items) {
  if (!Array.isArray(items)) return null;
  return items.slice(0, MAX_ITEMS).map((it, i) => ({
    id: String(it?.id || `i${Date.now().toString(36)}${i}`).slice(0, 40),
    text: String(it?.text ?? '').slice(0, 2000),
    done: !!it?.done
  }));
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

    try {
      await connectDB();
    } catch (dbError) {
      return serverError(res, dbError);
    }

    const workspace = req.workspace;
    if (!workspace) return error(res, 'Workspace context required', 400);
    // Invited people who already have an account are linked to the workspace straight away
    // (the rest of the app lets them in), so only declined invitations are shut out.
    const member = req.member && req.member.status !== 'rejected' ? req.member : null;
    const isAdmin = member && (member.role === 'owner' || member.role === 'admin');
    const canCreate = isAdmin || !!member?.permissions?.editNotes;

    const { id, action, _single } = req.query;
    const uid = user._id;

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
          data: Buffer.from(file.data.buffer ?? file.data).toString('base64')
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
            $set: { updatedByEmail: user.email }
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
          { $pull: { attachments: { id: fileId } }, $set: { updatedByEmail: user.email } },
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

        if (wantsContent) {
          if (!canEditContent) return error(res, 'You can only view this note', 403);
          Object.assign(set, contentPatch(body));
          set.updatedByEmail = user.email;
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
          const at = body.reminder ? new Date(body.reminder) : null;
          if (at && Number.isNaN(at.getTime())) return error(res, 'Invalid reminder time', 400);
          await Note.updateOne({ _id: id }, { $pull: { reminders: { userId: uid } } });
          const repeat = REPEATS.includes(body.reminderRepeat) ? body.reminderRepeat : 'none';
          if (at) update.$push = { ...(update.$push || {}), reminders: { userId: uid, at, repeat } };
          else if (!Object.keys(set).length && !Object.keys(update).length) {
            const cleared = await Note.findById(id).lean();
            return success(res, present(cleared, user, member));
          }
        }

        // Sharing and trash belong to the creator
        if (body.isShared !== undefined || body.collaborators !== undefined || body.trashed !== undefined) {
          if (!isOwner) return error(res, 'Only the note owner can do that', 403);
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

        const updated = await Note.findOneAndUpdate(
          { _id: id, workspaceId: workspace._id },
          update,
          { new: true, runValidators: true }
        ).lean();
        if (!updated) return notFound(res, 'Note not found');
        return success(res, present(updated, user, member));
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
