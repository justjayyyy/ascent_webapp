import connectDB from '../lib/mongodb.js';
import Workspace from '../models/Workspace.js';
import User from '../models/User.js';
import { authMiddleware } from '../middleware/auth.js';
import { handleCors } from '../lib/cors.js';
import { success, error, serverError, unauthorized, notFound, forbidden } from '../lib/response.js';
import { sendEmail } from '../lib/email-helper.js';
import { getEmailTemplate } from '../lib/email-templates.js';
import { deleteWorkspaceData } from '../lib/workspaceData.js';
import { deleteIfEmpty } from '../lib/deleteAccount.js';
import { findInvitation, inviteKeyOf, newInviteToken } from '../lib/invitations.js';
import { linkOrigin } from '../lib/links.js';
import {
  ASSIGNABLE_ROLES,
  MAX_MEMBERS,
  buildPermissions,
  canAssignRole,
  canManageMember,
  escapeHtml,
  findAcceptedMember,
  isManagerRole,
  isOwnerMember,
  isSame,
  isValidEmail,
} from '../../shared/workspaceAccess.js';

// The plain-text email from its HTML: tags dropped and the escaped characters turned back, so a household called
// "Levi & Sons" reads as that, not "Levi &amp; Sons"
const HTML_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" };
const strip = (html) => html.replace(/<[^>]*>/g, '').replace(/&(amp|lt|gt|quot|#39);/g, (m, e) => HTML_ENTITIES[e]);

const inviteCopy = (language, inviter, workspaceName) => {
  const w = escapeHtml(workspaceName);
  const who = escapeHtml(inviter);
  const copy = {
    he: {
      subject: `הזמנה להצטרף ל-${workspaceName}`,
      greeting: 'שלום,',
      message: `<strong>${who}</strong> הזמין/ה אותך להצטרף לסביבת העבודה "<strong>${w}</strong>" ב-Ascent.`,
      cta: 'קבל הזמנה',
      footer: 'אם אין לך חשבון, תתבקש ליצור אחד.',
    },
    ru: {
      subject: `Приглашение в ${workspaceName}`,
      greeting: 'Здравствуйте,',
      message: `<strong>${who}</strong> приглашает вас присоединиться к рабочей области "<strong>${w}</strong>" в Ascent.`,
      cta: 'Принять приглашение',
      footer: 'Если у вас нет учетной записи, вам будет предложено создать ее.',
    },
    en: {
      subject: `Invitation to join ${workspaceName}`,
      greeting: 'Hello,',
      message: `<strong>${who}</strong> invited you to join the workspace "<strong>${w}</strong>" on Ascent.`,
      cta: 'Accept Invitation',
      footer: "If you don't have an account, you will be asked to create one.",
    },
  };
  return copy[language] || copy.en;
};

const LINK_INVITE_TTL_MS = 48 * 60 * 60 * 1000;

const inviteLinkFor = (req, member) => `${linkOrigin(req)}/accept-invitation/${inviteKeyOf(member)}`;

async function sendInvitation({ req, workspace, member, inviter, language }) {
  const inviteLink = inviteLinkFor(req, member);
  const inviterName = inviter.full_name || inviter.email;
  const c = inviteCopy(language, inviterName, workspace.name);

  const html = getEmailTemplate({
    language,
    title: c.subject,
    body: `<p>${c.greeting}</p><p>${c.message}</p><br/><p style="font-size: 14px; opacity: 0.8;">${c.footer}</p>`,
    cta: { text: c.cta, link: inviteLink },
  });
  const result = await sendEmail({
    to: member.email,
    subject: c.subject,
    body: `${c.greeting}\n\n${strip(c.message)}\n\n${c.cta}: ${inviteLink}\n\n${c.footer}`,
    html,
  });
  if (!result.sent) console.error('Failed to send invitation email:', result.error || result.message);
  return { inviteLink, emailSent: !!result.sent, emailError: result.error || result.message };
}

// Plain workspace with each member's display name and avatar, so the UI can show people rather than emails.
// Invitation tokens are secrets: only owners and admins of the workspace see them.
async function present(workspace, viewer) {
  const plain = workspace.toObject ? workspace.toObject() : { ...workspace };
  const seesTokens = !!viewer && (isSame(plain.ownerId, viewer._id) || isManagerRole(findAcceptedMember(plain, viewer._id)?.role));
  const ids = plain.members.map((m) => m.userId).filter(Boolean);
  const users = ids.length ? await User.find({ _id: { $in: ids } }).select('full_name avatar').lean() : [];
  const byId = new Map(users.map((u) => [String(u._id), u]));
  plain.id = String(plain._id);
  plain.members = plain.members.map((m) => {
    const u = byId.get(String(m.userId));
    // Workspaces created before roles existed can have the owner stored as a viewer.
    const role = m.status === 'accepted' && isSame(m.userId, plain.ownerId) ? 'owner' : m.role;
    const { inviteToken, ...rest } = m;
    return { ...rest, ...(seesTokens && inviteToken ? { inviteToken } : {}), role, name: u?.full_name || '', avatar: u?.avatar || null };
  });
  return plain;
}

const memberScope = (user) => ({ $elemMatch: { userId: user._id, status: 'accepted' } });
const findTarget = (workspace, memberId) =>
  workspace.members.find((m) => isSame(m._id, memberId) || (m.userId && isSame(m.userId, memberId)));

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  try {
    await connectDB();
    const user = await authMiddleware(req, res);
    if (!user) return;

    const { method } = req;
    const { id, action, memberId } = req.query;
    const body = req.body || {};

    // Loads the workspace and the acting member; replies with 404 when the caller isn't an accepted member.
    const load = async () => {
      if (!id) { error(res, 'Workspace ID required', 400); return null; }
      const workspace = await Workspace.findOne({ _id: id, members: memberScope(user) });
      if (!workspace) { notFound(res, 'Workspace not found or access denied'); return null; }
      return { workspace, actor: findAcceptedMember(workspace, user._id) };
    };
    // Same, but the caller must be an owner or admin.
    const loadManager = async () => {
      const ctx = await load();
      if (!ctx) return null;
      if (!isManagerRole(ctx.actor.role)) { forbidden(res, 'Only owners and admins can manage members'); return null; }
      return ctx;
    };

    switch (method) {
      case 'GET': {
        // Cheap change check open apps poll: dataRev moves on any data write, updated on member/settings changes.
        if (action === 'pulse') {
          if (!id) return error(res, 'Workspace ID required', 400);
          const ws = await Workspace.findOne({ _id: id, members: memberScope(user) }).select('dataRev updated_date').lean();
          if (!ws) return notFound(res, 'Workspace not found or access denied');
          return success(res, { dataRev: ws.dataRev || 0, updated: ws.updated_date });
        }
        if (action === 'invitations') {
          // Only accounts that proved they own their email see invitations in-app; others use the emailed link.
          if (user.authProvider !== 'google' && user.emailVerified !== true) return success(res, []);
          const workspaces = await Workspace.find({
            members: { $elemMatch: { email: user.email, status: 'pending' } },
          }).lean();
          const inviterIds = workspaces.map((w) => w.members.find((m) => m.email === user.email)?.invitedBy || w.ownerId);
          const inviters = await User.find({ _id: { $in: inviterIds } }).select('full_name email').lean();
          const nameOf = (uid) => {
            const u = inviters.find((x) => isSame(x._id, uid));
            return u?.full_name || u?.email || '';
          };
          return success(res, workspaces.map((w) => {
            const m = w.members.find((x) => x.email === user.email && x.status === 'pending');
            return {
              id: inviteKeyOf(m),
              workspaceId: String(w._id),
              workspaceName: w.name,
              role: m.role,
              invitedAt: m.invitedAt,
              invitedByName: nameOf(m.invitedBy || w.ownerId),
            };
          }));
        }
        if (id) {
          const workspace = await Workspace.findOne({ _id: id, members: memberScope(user) });
          if (!workspace) return notFound(res, 'Workspace not found or access denied');
          return success(res, await present(workspace, user));
        }
        const workspaces = await Workspace.find({ members: memberScope(user) }).sort('-created_date');
        return success(res, await Promise.all(workspaces.map((w) => present(w, user))));
      }

      case 'POST': {
        if (action === 'invite') {
          const ctx = await loadManager();
          if (!ctx) return;
          const { workspace, actor } = ctx;

          const via = body.method === 'link' ? 'link' : 'email';
          const email = via === 'email' ? String(body.email || '').toLowerCase().trim() : '';
          if (via === 'email') {
            if (!isValidEmail(email)) return error(res, 'A valid email is required', 400);
            if (email === user.email) return error(res, 'You are already in this workspace', 400);
          }

          const role = body.role || 'viewer';
          if (!canAssignRole(workspace, actor, role)) return forbidden(res, 'You cannot assign this role');
          if (workspace.members.length >= MAX_MEMBERS) return error(res, `A workspace can have up to ${MAX_MEMBERS} members`, 400);

          const invitedUser = via === 'email' ? await User.findOne({ email }).select('_id language').lean() : null;
          const fields = {
            userId: invitedUser?._id || null,
            role,
            status: 'pending',
            inviteKind: via,
            expiresAt: via === 'link' ? new Date(Date.now() + LINK_INVITE_TTL_MS) : null,
            permissions: buildPermissions(role, body.permissions),
            invitedBy: user._id,
            invitedAt: new Date(),
            joinedAt: null,
            inviteToken: newInviteToken(),
          };

          let member = email ? workspace.members.find((m) => m.email === email) : null;
          if (member && !['declined', 'rejected'].includes(member.status)) {
            return error(res, member.status === 'accepted' ? 'This person is already a member' : 'This person has already been invited', 409);
          }
          if (member) Object.assign(member, fields);
          else {
            workspace.members.push({ email, ...fields });
            member = workspace.members[workspace.members.length - 1];
          }
          await workspace.save();

          if (via === 'link') {
            return success(res, {
              message: 'QR invitation created',
              workspace: await present(workspace, user),
              inviteLink: inviteLinkFor(req, member),
              expiresAt: member.expiresAt,
              memberId: String(member._id),
            });
          }
          const sent = await sendInvitation({
            req, workspace, member, inviter: user, language: invitedUser?.language || user.language || 'en',
          });
          return success(res, { message: sent.emailSent ? 'Invitation sent' : 'Invitation created (Email failed)', workspace: await present(workspace, user), ...sent });
        }

        if (action === 'resend') {
          const ctx = await loadManager();
          if (!ctx) return;
          const member = memberId && findTarget(ctx.workspace, memberId);
          if (!member) return notFound(res, 'Invitation not found');
          if (member.status !== 'pending') return error(res, 'This invitation is no longer pending', 400);
          if (member.inviteKind === 'link') return error(res, 'QR invitations have no email to resend', 400);
          if (!member.inviteToken) {
            member.inviteToken = newInviteToken();
            await ctx.workspace.save();
          }
          const invitedUser = member.userId ? await User.findById(member.userId).select('language').lean() : null;
          const sent = await sendInvitation({
            req, workspace: ctx.workspace, member, inviter: user, language: invitedUser?.language || user.language || 'en',
          });
          return success(res, sent);
        }

        if (action === 'accept' || action === 'decline') {
          const token = req.query.token || memberId;
          if (!token) return error(res, 'Invitation token required', 400);
          const found = await findInvitation(Workspace, token);
          if (!found) return notFound(res, 'Invitation not found');
          const { workspace, member } = found;

          if (member.inviteKind === 'link') {
            // Open invitation: whoever holds it can join once, until it expires.
            if (action === 'decline') return success(res, { message: 'Invitation declined' });
            if (findAcceptedMember(workspace, user._id)) return error(res, 'You are already a member of this workspace', 409);
            if (member.status !== 'pending' || !member.expiresAt || member.expiresAt <= new Date()) {
              return error(res, 'This invitation is no longer valid', 410);
            }
            const claimed = await Workspace.updateOne(
              { _id: workspace._id, members: { $elemMatch: { _id: member._id, status: 'pending', inviteKind: 'link', expiresAt: { $gt: new Date() } } } },
              { $set: { 'members.$.status': 'accepted', 'members.$.userId': user._id, 'members.$.email': user.email, 'members.$.joinedAt': new Date() } }
            );
            if (!claimed.modifiedCount) return error(res, 'This invitation is no longer valid', 410);
            return success(res, await present(await Workspace.findById(workspace._id), user));
          }

          if (member.email !== user.email) return notFound(res, 'Invitation not found');

          if (action === 'accept') {
            if (member.status === 'pending') {
              member.status = 'accepted';
              member.userId = user._id;
              member.joinedAt = new Date();
              await workspace.save();
            } else if (member.status !== 'accepted') {
              return error(res, 'This invitation is no longer valid', 400);
            }
            return success(res, await present(workspace, user));
          }
          if (member.status === 'pending') {
            member.status = 'declined';
            await workspace.save();
          }
          return success(res, { message: 'Invitation declined' });
        }

        if (action === 'leave') {
          const ctx = await load();
          if (!ctx) return;
          if (isOwnerMember(ctx.workspace, ctx.actor)) {
            return error(res, 'The owner cannot leave. Delete the workspace instead.', 400);
          }
          ctx.workspace.members = ctx.workspace.members.filter((m) => !isSame(m._id, ctx.actor._id));
          await ctx.workspace.save();
          return success(res, { message: 'You left the workspace' });
        }

        // The owner deleted their account: a remaining member keeps the workspace (and becomes its owner)
        // or lets it go. The first to keep it wins; when the last one lets go it is deleted with its data.
        if (action === 'claim') {
          if (!id) return error(res, 'Workspace ID required', 400);
          const claimed = await Workspace.updateOne(
            { _id: id, ownerLeft: { $ne: null }, members: memberScope(user) },
            { $set: { ownerId: user._id, ownerLeft: null, 'members.$.role': 'owner', 'members.$.permissions': buildPermissions('owner') } }
          );
          if (!claimed.matchedCount) return error(res, 'This workspace already has an owner', 409);
          return success(res, await present(await Workspace.findById(id), user));
        }

        if (action === 'release') {
          if (!id) return error(res, 'Workspace ID required', 400);
          const left = await Workspace.updateOne(
            { _id: id, ownerLeft: { $ne: null }, members: memberScope(user) },
            { $pull: { members: { userId: user._id } } }
          );
          if (!left.matchedCount) return error(res, 'This workspace already has an owner', 409);
          const deleted = await deleteIfEmpty(id);
          return success(res, { left: true, deleted });
        }

        if (action === 'heartbeat') {
          if (!id) return error(res, 'Workspace ID required', 400);
          await Workspace.updateOne(
            { _id: id, members: memberScope(user) },
            { $set: { 'members.$[me].lastSeenAt': new Date() } },
            { arrayFilters: [{ 'me.userId': user._id, 'me.status': 'accepted' }], timestamps: false }
          );
          return success(res, { ok: true });
        }

        // Create a new workspace
        const name = String(body.name || '').trim();
        if (!name) return error(res, 'Workspace name required', 400);
        const workspace = await Workspace.create({
          name: name.slice(0, 80),
          ownerId: user._id,
          members: [{
            userId: user._id,
            email: user.email,
            role: 'owner',
            status: 'accepted',
            joinedAt: new Date(),
            permissions: buildPermissions('owner'),
          }],
        });
        return success(res, await present(workspace, user), 201);
      }

      case 'PUT': {
        const ctx = await load();
        if (!ctx) return;
        const { workspace, actor } = ctx;

        if (action === 'updateMember') {
          if (!isManagerRole(actor.role)) return forbidden(res, 'Only owners and admins can manage members');
          const target = memberId && findTarget(workspace, memberId);
          if (!target) return notFound(res, 'Member not found');
          if (!canManageMember(workspace, actor, target)) return forbidden(res, 'You cannot change this member');

          const role = body.role ?? target.role;
          if (body.role && body.role !== target.role && !canAssignRole(workspace, actor, body.role)) {
            return forbidden(res, 'You cannot assign this role');
          }
          if (!ASSIGNABLE_ROLES.includes(role)) return error(res, 'Invalid role', 400);

          const roleChanged = role !== target.role;
          if (body.permissions !== undefined) target.permissions = buildPermissions(role, body.permissions);
          else if (roleChanged) target.permissions = buildPermissions(role);
          target.role = role;

          await workspace.save();
          return success(res, await present(workspace, user));
        }

        // Household options: the AI assistant and alerts for large expenses (owners and admins)
        if (action === 'settings') {
          if (!isManagerRole(actor?.role) && !isSame(workspace.ownerId, user._id)) return forbidden(res, 'Only owners and admins can change household settings');
          const next = { ...(workspace.settings?.toObject?.() ?? workspace.settings ?? {}) };
          if (body.aiAssistant !== undefined) next.aiAssistant = body.aiAssistant === true;
          if (body.largeExpenseAlert !== undefined) {
            const amount = Number(body.largeExpenseAlert);
            next.largeExpenseAlert = body.largeExpenseAlert === null || !(amount > 0) ? null : Math.min(amount, 1e9);
            next.largeExpenseCurrency = next.largeExpenseAlert ? String(body.largeExpenseCurrency || user.currency || 'ILS').toUpperCase().slice(0, 3) : null;
          }
          workspace.settings = next;
          await workspace.save();
          return success(res, await present(workspace, user));
        }

        if (!actor || actor.role !== 'owner') return forbidden(res, 'Only the owner can rename the workspace');
        const name = String(body.name || '').trim();
        if (!name) return error(res, 'Workspace name required', 400);
        workspace.name = name.slice(0, 80);
        await workspace.save();
        return success(res, await present(workspace, user));
      }

      case 'DELETE': {
        if (action === 'removeMember') {
          const ctx = await loadManager();
          if (!ctx) return;
          const { workspace, actor } = ctx;
          const target = memberId && findTarget(workspace, memberId);
          if (!target) return notFound(res, 'Member not found');
          if (!canManageMember(workspace, actor, target)) return forbidden(res, 'You cannot remove this member');
          workspace.members = workspace.members.filter((m) => !isSame(m._id, target._id));
          await workspace.save();
          return success(res, await present(workspace, user));
        }

        if (!id) return error(res, 'Workspace ID required', 400);
        const deleted = await Workspace.findOneAndDelete({ _id: id, ownerId: user._id });
        if (!deleted) return unauthorized(res, 'Not authorized to delete this workspace');
        await deleteWorkspaceData(deleted._id);
        return success(res, { message: 'Workspace deleted' });
      }

      default:
        return error(res, 'Method not allowed', 405);
    }
  } catch (err) {
    return serverError(res, err);
  }
}
