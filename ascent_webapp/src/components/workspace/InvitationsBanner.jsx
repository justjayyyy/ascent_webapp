import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, MailPlus } from 'lucide-react';
import { toast } from 'sonner';
import { ascent } from '@/api/client';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/AuthContext';
import { useTheme } from '../ThemeProvider';
import { fmt, roleLabel } from './utils';

// Invitations addressed to the signed-in Google account; password accounts join through the emailed link.
export default function InvitationsBanner() {
  const { t } = useTheme();
  const { user, refreshWorkspaces } = useAuth();
  const queryClient = useQueryClient();

  const { data: invitations = [] } = useQuery({
    queryKey: ['workspace-invitations', user?.id],
    queryFn: () => ascent.workspaces.myInvitations(),
    enabled: !!user,
    staleTime: 60 * 1000,
    refetchInterval: 2 * 60 * 1000,
    retry: false,
  });

  const respond = useMutation({
    mutationFn: ({ id, accept }) => (accept ? ascent.workspaces.acceptInvitation(id) : ascent.workspaces.declineInvitation(id)),
    onSuccess: async (_, { accept }) => {
      toast.success(t(accept ? 'wsInviteAccepted' : 'wsInviteDeclined'));
      await queryClient.invalidateQueries({ queryKey: ['workspace-invitations'] });
      if (accept) await refreshWorkspaces();
    },
    onError: (err) => toast.error(err?.message || t('wsFailed')),
  });

  if (!Array.isArray(invitations) || invitations.length === 0) return null;

  return (
    <section aria-label={t('wsInvitesTitle')} className="space-y-2 px-4 pt-4 md:px-8">
      {invitations.map((inv) => {
        const busy = respond.isPending && respond.variables?.id === inv.id;
        return (
          <div key={inv.id} className="flex flex-col gap-3 rounded-3xl border border-primary/30 bg-primary/5 p-4 sm:flex-row sm:items-center">
            <span className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary sm:flex">
              <MailPlus className="h-5 w-5" aria-hidden="true" />
            </span>
            <p className="min-w-0 flex-1 text-sm text-foreground text-pretty">
              {fmt(t('wsInvitedYouTo'), {
                name: inv.invitedByName || t('wsSomeone'),
                workspace: inv.workspaceName,
                role: roleLabel(t, inv.role),
              })}
            </p>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                className="h-11 flex-1 rounded-xl sm:h-9 sm:flex-none"
                disabled={busy}
                onClick={() => respond.mutate({ id: inv.id, accept: false })}
              >
                {t('wsDecline')}
              </Button>
              <Button
                className="h-11 flex-1 rounded-xl sm:h-9 sm:flex-none"
                disabled={busy}
                onClick={() => respond.mutate({ id: inv.id, accept: true })}
              >
                {busy && <Loader2 className="me-1.5 h-4 w-4 animate-spin" aria-hidden="true" />}
                {t('wsAccept')}
              </Button>
            </div>
          </div>
        );
      })}
    </section>
  );
}
