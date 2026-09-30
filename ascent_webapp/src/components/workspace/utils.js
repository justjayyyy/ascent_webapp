import { formatDistanceToNowStrict } from 'date-fns';
import { enUS, he, ru } from 'date-fns/locale';

export { AREAS, ASSIGNABLE_ROLES, MAX_MEMBERS, buildPermissions, canAssignRole, canManageMember, detectPreset, isManagerRole, isValidEmail, levelOf, presetFor, withLevel } from '../../../shared/workspaceAccess.js';

const LOCALES = { en: enUS, he, ru };

// Heartbeats land every 60s, so anything inside 2.5 minutes counts as "here right now".
const ONLINE_WINDOW_MS = 150 * 1000;

export const fmt = (text, vars = {}) => String(text).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');

export const memberKey = (m) => String(m._id || m.id);

export const memberName = (m) => m.name || m.email?.split('@')[0] || '';

export const isOnline = (m, now = Date.now()) => !!m.lastSeenAt && now - new Date(m.lastSeenAt).getTime() < ONLINE_WINDOW_MS;

export const timeAgo = (date, language) =>
  formatDistanceToNowStrict(new Date(date), { locale: LOCALES[language] || enUS });

export const inviteLinkFor = (m) => `${window.location.origin}/accept-invitation/${memberKey(m)}`;

const ROLE_KEYS = { owner: 'wsOwner', admin: 'wsAdmin', editor: 'wsEditor', viewer: 'wsViewer', custom: 'wsCustom' };
export const roleLabel = (t, role) => t(ROLE_KEYS[role] || 'wsViewer');
