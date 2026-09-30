import React, { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Copy, KeyRound, LogOut, MoreHorizontal, QrCode, Send, Trash2, UserPlus, Users } from 'lucide-react';
import { toast } from 'sonner';
import { ascent } from '@/api/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useAuth } from '@/lib/AuthContext';
import { useTheme } from '../ThemeProvider';
import MemberAvatar from './MemberAvatar';
import InviteMemberDialog from './InviteMemberDialog';
import EditAccessDialog from './EditAccessDialog';
import InviteShare from './InviteShare';
import ResponsiveModal from './ResponsiveModal';
import { presetOf } from './PermissionEditor';
import {
  MAX_MEMBERS, canManageMember, fmt, inviteLinkFor, isManagerRole, isOnline, memberKey, memberName, roleLabel, timeAgo,
} from './utils';

const copyText = async (text, t) => {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(t('wsLinkCopied'));
  } catch {
    toast.error(t('wsFailed'));
  }
};

function MemberRow({ member, isSelf, canManage, t, language, onEdit, onResend, onRemove, onQr }) {
  const pending = member.status === 'pending';
  const online = isSelf || isOnline(member);
  const preset = member.role === 'owner' ? 'owner' : presetOf(member.role, member.permissions);

  let subline;
  if (pending) subline = member.invitedByName ? fmt(t('wsInvitedBy'), { name: member.invitedByName }) : member.email;
  else if (isSelf) subline = member.email;
  else if (online) subline = t('wsActiveNow');
  else if (member.lastSeenAt) subline = fmt(t('wsSeenAgo'), { time: timeAgo(member.lastSeenAt, language) });
  else subline = t('wsNeverSeen');

  return (
    <li className="flex items-center gap-3 px-4 py-3 sm:px-5">
      <MemberAvatar member={member} online={!pending && online} pending={pending} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-sm font-medium text-foreground">
          <span className="truncate">{memberName(member)}</span>
          {isSelf && <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-xs font-normal text-muted-foreground">{t('wsYou')}</span>}
        </p>
        <p className={`truncate text-sm ${!pending && online && !isSelf ? 'text-success' : 'text-muted-foreground'}`} dir={isSelf ? 'ltr' : undefined}>
          {subline}
        </p>
        {pending && !isSelf && <p className="truncate text-sm text-muted-foreground" dir="ltr">{member.email}</p>}
      </div>
      {!pending && (
        <Badge variant="outline" className="hidden shrink-0 rounded-lg text-xs font-medium sm:inline-flex">
          {roleLabel(t, preset)}
        </Badge>
      )}
      {canManage && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0 rounded-xl sm:h-9 sm:w-9" aria-label={memberName(member)}>
              <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-48 rounded-xl">
            {pending ? (
              <>
                <DropdownMenuItem className="min-h-11 gap-2 sm:min-h-9" onSelect={() => onResend(member)}>
                  <Send className="h-4 w-4" aria-hidden="true" />{t('wsResendInvite')}
                </DropdownMenuItem>
                <DropdownMenuItem className="min-h-11 gap-2 sm:min-h-9" onSelect={() => onQr(member)}>
                  <QrCode className="h-4 w-4" aria-hidden="true" />{t('wsShowQr')}
                </DropdownMenuItem>
                <DropdownMenuItem className="min-h-11 gap-2 sm:min-h-9" onSelect={() => copyText(inviteLinkFor(member), t)}>
                  <Copy className="h-4 w-4" aria-hidden="true" />{t('wsCopyLink')}
                </DropdownMenuItem>
              </>
            ) : (
              <DropdownMenuItem className="min-h-11 gap-2 sm:min-h-9" onSelect={() => onEdit(member)}>
                <KeyRound className="h-4 w-4" aria-hidden="true" />{t('wsChangeRole')}
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem className="min-h-11 gap-2 text-danger focus:text-danger sm:min-h-9" onSelect={() => onRemove(member)}>
              <Trash2 className="h-4 w-4" aria-hidden="true" />{pending ? t('wsCancelInvite') : t('wsRemoveMember')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </li>
  );
}

export default function MembersSection() {
  const { t, language } = useTheme();
  const { currentWorkspace, currentMember, isWorkspaceOwner, refreshWorkspaces } = useAuth();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [leaving, setLeaving] = useState(false);
  const [qrFor, setQrFor] = useState(null);

  const workspaceId = currentWorkspace?.id || currentWorkspace?._id;
  const iManage = isManagerRole(currentMember?.role) || isWorkspaceOwner;
  const actor = currentMember ? { ...currentMember, role: isWorkspaceOwner ? 'owner' : currentMember.role } : null;

  const { accepted, pending } = useMemo(() => {
    const all = currentWorkspace?.members || [];
    const mine = currentMember && memberKey(currentMember);
    const accepted = all
      .filter((m) => m.status === 'accepted')
      .sort((a, b) => (memberKey(b) === mine) - (memberKey(a) === mine) || (b.role === 'owner') - (a.role === 'owner'));
    return { accepted, pending: iManage ? all.filter((m) => m.status === 'pending') : [] };
  }, [currentWorkspace?.members, currentMember, iManage]);

  const onlineOthers = accepted.filter((m) => memberKey(m) !== (currentMember && memberKey(currentMember)) && isOnline(m)).length;
  const atLimit = accepted.length + pending.length >= MAX_MEMBERS;

  const fail = (err) => toast.error(err?.message || t('wsFailed'));

  const invite = useMutation({
    mutationFn: (data) => ascent.workspaces.invite(workspaceId, data),
    onSuccess: async (result) => {
      if (result?.emailSent !== false) toast.success(t('wsInviteSent'));
      await refreshWorkspaces();
    },
  });

  const saveAccess = useMutation({
    mutationFn: ({ member, access }) => ascent.workspaces.updateMember(workspaceId, memberKey(member), access),
    onSuccess: async () => {
      toast.success(t('wsAccessSaved'));
      await refreshWorkspaces();
    },
    onError: fail,
  });

  const remove = useMutation({
    mutationFn: (member) => ascent.workspaces.removeMember(workspaceId, memberKey(member)),
    onSuccess: async () => {
      toast.success(t('wsMemberRemoved'));
      await refreshWorkspaces();
    },
    onError: fail,
  });

  const resend = useMutation({
    mutationFn: (member) => ascent.workspaces.resendInvite(workspaceId, memberKey(member)),
    onSuccess: (result) => (result?.emailSent === false ? toast.error(t('wsInviteEmailFailed')) : toast.success(t('wsInviteResent'))),
    onError: fail,
  });

  const leave = useMutation({
    mutationFn: () => ascent.workspaces.leave(workspaceId),
    onSuccess: () => {
      toast.success(t('wsLeft'));
      localStorage.removeItem('ascent_current_workspace_id');
      window.location.assign('/');
    },
    onError: fail,
  });

  const canGrantAdmin = isWorkspaceOwner;
  const rowProps = { t, language, onEdit: setEditing, onResend: resend.mutate, onRemove: setRemoving, onQr: setQrFor };

  return (
    <>
      <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-foreground">
            {t('wsMembers')} <span className="font-normal text-muted-foreground">· {accepted.length}</span>
          </h3>
          {onlineOthers > 0 && (
            <p className="flex items-center gap-1.5 text-sm text-success">
              <span className="h-2 w-2 rounded-full bg-success" aria-hidden="true" />
              {fmt(t('wsOnlineCount'), { n: onlineOthers })}
            </p>
          )}
        </div>
        {iManage && (
          <Button onClick={() => setInviteOpen(true)} disabled={atLimit} variant="secondary" className="h-11 shrink-0 rounded-xl sm:h-9">
            <UserPlus className="me-1.5 h-4 w-4" aria-hidden="true" />
            {t('wsInviteMember')}
          </Button>
        )}
      </div>

      <ul className="divide-y divide-border/60">
        {accepted.map((m) => {
          const isSelf = currentMember && memberKey(m) === memberKey(currentMember);
          return (
            <MemberRow key={memberKey(m)} member={m} isSelf={isSelf} canManage={canManageMember(currentWorkspace, actor, m)} {...rowProps} />
          );
        })}
      </ul>

      {accepted.length <= 1 && pending.length === 0 && (
        <div className="flex flex-col items-center gap-3 px-6 py-8 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            <Users className="h-5 w-5" aria-hidden="true" />
          </span>
          <p className="max-w-xs text-sm text-muted-foreground text-pretty">{t('wsNoMembers')}</p>
        </div>
      )}

      {pending.length > 0 && (
        <div>
          <h3 className="px-4 pt-3 text-xs font-medium uppercase tracking-wide text-muted-foreground sm:px-5">{t('wsPending')}</h3>
          <ul className="divide-y divide-border/60">
            {pending.map((m) => (
              <MemberRow key={memberKey(m)} member={m} canManage={canManageMember(currentWorkspace, actor, m)} {...rowProps} />
            ))}
          </ul>
        </div>
      )}

      {!iManage && <p className="px-4 py-3 text-sm text-muted-foreground text-pretty sm:px-5">{t('wsReadOnlyHint')}</p>}

      {!isWorkspaceOwner && currentMember && (
        <div className="px-4 py-3 sm:px-5">
          <Button
            variant="outline"
            onClick={() => setLeaving(true)}
            className="h-11 rounded-xl border-danger/40 text-danger hover:bg-danger/10 hover:text-danger sm:h-9"
          >
            <LogOut className="me-1.5 h-4 w-4 rtl:-scale-x-100" aria-hidden="true" />
            {t('wsLeave')}
          </Button>
        </div>
      )}

      <InviteMemberDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        workspaceName={currentWorkspace?.name}
        canGrantAdmin={canGrantAdmin}
        onInvite={invite.mutateAsync}
      />

      <EditAccessDialog
        member={editing}
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        canGrantAdmin={canGrantAdmin}
        onSave={(member, access) => saveAccess.mutateAsync({ member, access })}
      />

      <ResponsiveModal
        open={!!qrFor}
        onOpenChange={(o) => !o && setQrFor(null)}
        title={t('wsShowQr')}
        footer={<Button className="h-11 rounded-xl sm:h-10" onClick={() => setQrFor(null)}>OK</Button>}
      >
        {qrFor && <InviteShare link={inviteLinkFor(qrFor)} email={qrFor.email} />}
      </ResponsiveModal>

      <AlertDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{fmt(t('wsRemoveTitle'), { name: removing ? memberName(removing) : '' })}</AlertDialogTitle>
            <AlertDialogDescription>{t('wsRemoveDesc')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('wsCancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-danger text-white hover:bg-danger/90"
              onClick={() => { remove.mutate(removing); setRemoving(null); }}
            >
              {removing?.status === 'pending' ? t('wsCancelInvite') : t('wsRemoveMember')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={leaving} onOpenChange={setLeaving}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{fmt(t('wsLeaveTitle'), { workspace: currentWorkspace?.name || '' })}</AlertDialogTitle>
            <AlertDialogDescription>{t('wsLeaveDesc')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('wsCancel')}</AlertDialogCancel>
            <AlertDialogAction className="bg-danger text-white hover:bg-danger/90" onClick={() => leave.mutate()}>
              {t('wsLeave')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
