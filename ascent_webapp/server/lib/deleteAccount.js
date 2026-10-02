// Deleting an account. Workspaces only this person used go with it. A workspace others still use stays,
// without its owner, and each remaining member is asked whether to keep it (see the claim and release
// actions in api/workspaces.js). Rows they added to shared workspaces stay: they are the household's record.
import User from '../models/User.js';
import Workspace from '../models/Workspace.js';
import Note from '../models/Note.js';
import NoteFile from '../models/NoteFile.js';
import IngestToken from '../models/IngestToken.js';
import IngestEvent from '../models/IngestEvent.js';
import PushSubscription from '../models/PushSubscription.js';
import AuthChallenge from '../models/AuthChallenge.js';
import CalendarLink from '../models/CalendarLink.js';
import { deleteWorkspaceData } from './workspaceData.js';
import { isSame } from '../../shared/workspaceAccess.js';

const othersIn = (workspace, userId) => workspace.members.filter((m) => m.status === 'accepted' && m.userId && !isSame(m.userId, userId));

/** Deletes the workspace and its rows when nobody is left in it. */
export async function deleteIfEmpty(workspaceId) {
  const gone = await Workspace.findOneAndDelete({ _id: workspaceId, members: { $not: { $elemMatch: { status: 'accepted' } } } });
  if (gone) await deleteWorkspaceData(gone._id);
  return !!gone;
}

export async function deleteAccount(user) {
  const uid = user._id;
  const email = String(user.email || '').toLowerCase();

  for (const ws of await Workspace.find({ ownerId: uid }).lean()) {
    if (othersIn(ws, uid).length && !ws.ownerLeft) {
      await Workspace.updateOne(
        { _id: ws._id },
        { $set: { ownerLeft: { email, name: user.full_name || '', at: new Date() } }, $pull: { members: { userId: uid } } }
      );
    } else {
      await Workspace.deleteOne({ _id: ws._id });
      await deleteWorkspaceData(ws._id);
    }
  }

  // Memberships and invitations elsewhere; a workspace whose owner already left may now be empty
  const joined = await Workspace.find({ $or: [{ 'members.userId': uid }, { 'members.email': email }] }).select('_id').lean();
  if (joined.length) {
    const ids = joined.map((w) => w._id);
    await Workspace.updateMany({ _id: { $in: ids } }, { $pull: { members: { userId: uid } } });
    if (email) await Workspace.updateMany({ _id: { $in: ids } }, { $pull: { members: { email } } });
    for (const id of ids) await deleteIfEmpty(id);
  }

  // Notes only they could see, and their place on everyone else's
  const privateNotes = await Note.find({ createdBy: uid, isShared: false }).select('_id').lean();
  if (privateNotes.length) {
    const noteIds = privateNotes.map((n) => n._id);
    await NoteFile.deleteMany({ noteId: { $in: noteIds } });
    await Note.deleteMany({ _id: { $in: noteIds } });
  }
  await Note.updateMany(
    { $or: [{ 'collaborators.userId': uid }, { 'reminders.userId': uid }, { pinnedBy: uid }, { archivedBy: uid }] },
    { $pull: { collaborators: { userId: uid }, reminders: { userId: uid }, pinnedBy: uid, archivedBy: uid } }
  );

  await Promise.all([
    IngestToken.deleteMany({ userId: uid }),
    IngestEvent.deleteMany({ userId: uid }),
    PushSubscription.deleteMany({ userId: uid }),
    AuthChallenge.deleteMany({ userId: uid }),
    CalendarLink.deleteMany({ userId: uid }),
  ]);
  await User.deleteOne({ _id: uid });
}
