// Single source of truth for workspace roles and permissions. Imported by the API and the web app,
// so it must stay dependency-free.

export const AREAS = ['Expenses', 'Budgets', 'Notes', 'Goals', 'Portfolio'];

export const PERMISSION_KEYS = [
  ...AREAS.flatMap((a) => [`view${a}`, `edit${a}`]),
  'viewSettings',
  'manageCards',
  'manageUsers',
];

// 'owner' is fixed by Workspace.ownerId and is never assignable.
export const ASSIGNABLE_ROLES = ['admin', 'editor', 'viewer'];
export const MAX_MEMBERS = 20;

const flags = (fn) => Object.fromEntries(PERMISSION_KEYS.map((k) => [k, fn(k)]));

export const ROLE_PRESETS = {
  owner: flags(() => true),
  admin: flags(() => true),
  editor: flags((k) => k !== 'manageUsers' && k !== 'manageCards'),
  viewer: flags((k) => k.startsWith('view')),
};

export const presetFor = (role) => ({ ...(ROLE_PRESETS[role] || ROLE_PRESETS.viewer) });

export const isManagerRole = (role) => role === 'owner' || role === 'admin';

// Normalises a permissions object: known keys only, edit implies view, manager roles are full access.
export function buildPermissions(role, input) {
  if (isManagerRole(role) || input === undefined || input === null) return presetFor(role);
  const src = typeof input === 'object' ? input : {};
  const out = flags((k) => src[k] === true);
  out.manageUsers = false;
  for (const a of AREAS) if (out[`edit${a}`]) out[`view${a}`] = true;
  return out;
}

// The role whose preset best describes these permissions, or 'custom' when none match.
export function detectPreset(permissions = {}) {
  for (const role of ['editor', 'viewer']) {
    const preset = ROLE_PRESETS[role];
    const same = PERMISSION_KEYS.every((k) => (permissions?.[k] === true) === preset[k]);
    if (same) return role;
  }
  return 'custom';
}

// none < view < edit for one area.
export const levelOf = (permissions, area) =>
  permissions?.[`edit${area}`] ? 'edit' : permissions?.[`view${area}`] ? 'view' : 'none';

export function withLevel(permissions, area, level) {
  return { ...permissions, [`view${area}`]: level !== 'none', [`edit${area}`]: level === 'edit' };
}

export const isSame = (a, b) => !!a && !!b && String(a) === String(b);

export const isOwnerMember = (workspace, member) =>
  member?.role === 'owner' || isSame(member?.userId, workspace?.ownerId);

export function findAcceptedMember(workspace, userId) {
  return (workspace?.members || []).find((m) => m.status === 'accepted' && isSame(m.userId, userId));
}

// Owners manage everyone except themselves; admins manage editors and viewers only. Nobody edits their own row.
export function canManageMember(workspace, actor, target) {
  if (!actor || !target || !isManagerRole(actor.role)) return false;
  if (isSame(actor._id, target._id) || isSame(actor.userId, target.userId)) return false;
  if (isOwnerMember(workspace, target)) return false;
  if (actor.role === 'owner' || isSame(workspace?.ownerId, actor.userId)) return true;
  return !isManagerRole(target.role);
}

export function canAssignRole(workspace, actor, role) {
  if (!ASSIGNABLE_ROLES.includes(role) || !actor) return false;
  const isOwner = actor.role === 'owner' || isSame(workspace?.ownerId, actor.userId);
  if (role === 'admin') return isOwner;
  return isOwner || actor.role === 'admin';
}

export const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || '');
