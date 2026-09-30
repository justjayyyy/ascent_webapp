import connectDB from '../lib/mongodb.js';
import Workspace from '../models/Workspace.js';
import User from '../models/User.js';
import { authMiddleware } from '../middleware/auth.js';
import { handleCors } from '../lib/cors.js';
import { success, error, serverError, unauthorized, notFound, forbidden } from '../lib/response.js';
import { sendEmail } from '../lib/email-helper.js';
import { getEmailTemplate } from '../lib/email-templates.js';
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

const strip = (html) => html.replace(/<[^>]*>/g, '');

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

const inviteLinkFor = (req, member) => {
  const origin = req.headers.origin || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:5173';
  return `${origin}/accept-invitation/${member._id}`;
};

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
async function present(workspace) {
  const plain = workspace.toObject ? workspace.toObject() : { ...workspace };
  const ids = plain.members.map((m) => m.userId).filter(Boolean);
  const users = ids.length ? await User.find({ _id: { $in: ids } }).select('full_name avatar').lean() : [];
  const byId = new Map(users.map((u) => [String(u._id), u]));
  plain.id = String(plain._id);
  plain.members = plain.members.map((m) => {
    const u = byId.get(String(m.userId));
    return { ...m, name: u?.full_name || '', avatar: u?.avatar || null };
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
        if (action === 'invitations') {
          // Only email-verified (Google) accounts see invitations in-app; everyone else uses the emailed link.
          if (user.authProvider !== 'google') return success(res, []);
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
              id: String(m._id),
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
          return success(res, await present(workspace));
        }
        const workspaces = await Workspace.find({ members: memberScope(user) }).sort('-created_date');
        return success(res, await Promise.all(workspaces.map(present)));
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
              workspace: await present(workspace),
              inviteLink: inviteLinkFor(req, member),
              expiresAt: member.expiresAt,
              memberId: String(member._id),
            });
          }
          const sent = await sendInvitation({
            req, workspace, member, inviter: user, language: invitedUser?.language || user.language || 'en',
          });
          return success(res, { message: sent.emailSent ? 'Invitation sent' : 'Invitation created (Email failed)', workspace: await present(workspace), ...sent });
        }

        if (action === 'resend') {
          const ctx = await loadManager();
          if (!ctx) return;
          const member = memberId && findTarget(ctx.workspace, memberId);
          if (!member) return notFound(res, 'Invitation not found');
          if (member.status !== 'pending') return error(res, 'This invitation is no longer pending', 400);
          if (member.inviteKind === 'link') return error(res, 'QR invitations have no email to resend', 400);
          const invitedUser = member.userId ? await User.findById(member.userId).select('language').lean() : null;
          const sent = await sendInvitation({
            req, workspace: ctx.workspace, member, inviter: user, language: invitedUser?.language || user.language || 'en',
          });
          return success(res, sent);
        }

        if (action === 'accept' || action === 'decline') {
          // The member id doubles as the emailed invitation token.
          const token = req.query.token || memberId;
          if (!token || !/^[a-f\d]{24}$/i.test(token)) return error(res, 'Invitation token required', 400);
          const workspace = await Workspace.findOne({ 'members._id': token });
          const member = workspace?.members.find((m) => isSame(m._id, token));
          if (!member) return notFound(res, 'Invitation not found');

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
            return success(res, await present(await Workspace.findById(workspace._id)));
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
            return success(res, await present(workspace));
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
        return success(res, await present(workspace), 201);
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
          return success(res, await present(workspace));
        }

        if (!actor || actor.role !== 'owner') return forbidden(res, 'Only the owner can rename the workspace');
        const name = String(body.name || '').trim();
        if (!name) return error(res, 'Workspace name required', 400);
        workspace.name = name.slice(0, 80);
        await workspace.save();
        return success(res, await present(workspace));
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
          return success(res, await present(workspace));
        }

        if (!id) return error(res, 'Workspace ID required', 400);
        const deleted = await Workspace.findOneAndDelete({ _id: id, ownerId: user._id });
        if (!deleted) return unauthorized(res, 'Not authorized to delete this workspace');
        return success(res, { message: 'Workspace deleted' });
      }

      default:
        return error(res, 'Method not allowed', 405);
    }
  } catch (err) {
    return serverError(res, err);
  }
}
