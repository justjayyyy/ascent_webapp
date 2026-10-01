// Creating accounts and their personal workspace, shared by email sign-up and Google sign-in.
import crypto from 'crypto';
import User from '../models/User.js';
import Workspace from '../models/Workspace.js';
import { buildPermissions } from '../../shared/workspaceAccess.js';

export const LANGUAGES = ['en', 'he', 'ru'];
export const THEMES = ['dark', 'light'];

/** The language and theme a new account starts with, when the device sent valid ones. */
export function startingPrefs({ language, theme } = {}) {
  return {
    ...(LANGUAGES.includes(language) && { language }),
    ...(THEMES.includes(theme) && { theme }),
  };
}

/** The member entry that makes `user` the owner of a workspace. */
export const ownerMember = (user) => ({
  userId: user._id,
  email: user.email,
  role: 'owner',
  status: 'accepted',
  joinedAt: new Date(),
  permissions: buildPermissions('owner'),
});

export async function createWorkspaceFor(user, name = 'My Workspace') {
  return Workspace.create({ name: String(name).trim().slice(0, 80) || 'My Workspace', ownerId: user._id, members: [ownerMember(user)] });
}

/** A password nobody can guess or sign in with, for accounts that only ever use Google. */
export const unusablePassword = () => `!google:${crypto.randomBytes(32).toString('hex')}`;

/**
 * Creates the user and their own workspace, which becomes the one they open by default. All or nothing:
 * if the workspace cannot be made, the user is removed again, so a retry can sign up cleanly instead of
 * finding an account with nowhere to put anything.
 */
export async function createAccount(fields) {
  // The caller signs the new account in straight away, so its first sign-in has already happened
  const user = await User.create({ ...fields, isFirstLogin: false });
  let workspace = null;
  try {
    workspace = await createWorkspaceFor(user);
    user.defaultWorkspace = workspace._id;
    await user.save();
    return user;
  } catch (err) {
    await Promise.allSettled([
      User.deleteOne({ _id: user._id }),
      workspace ? Workspace.deleteOne({ _id: workspace._id }) : null,
    ]);
    throw err;
  }
}
