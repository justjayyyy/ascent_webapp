import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Loader2, MailWarning } from 'lucide-react';
import { toast } from 'sonner';
import { ascent } from '@/api/client';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAuth } from '@/lib/AuthContext';
import { useTheme } from '../ThemeProvider';

const fill = (text, vars) => Object.entries(vars).reduce((s, [k, v]) => s.replace(`{${k}}`, v), text);
const idOf = (ws) => String(ws.id || ws._id);

/** Asks email sign-ups to confirm their address, with a way to send the link again. */
export function VerifyEmailBanner() {
  const { t } = useTheme();
  const { user } = useAuth();
  const [sent, setSent] = useState(false);
  const send = useMutation({
    mutationFn: () => ascent.auth.sendVerification(),
    onSuccess: () => setSent(true),
    onError: () => toast.error(t('verifySendFailed')),
  });

  if (user?.emailVerified !== false) return null;
  return (
    <section className="px-4 pt-4 md:px-8">
      <div className="flex flex-col gap-3 rounded-3xl border border-chart-4/30 bg-chart-4/5 p-4 sm:flex-row sm:items-center">
        <span className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-chart-4/10 text-chart-4 sm:flex">
          <MailWarning className="h-5 w-5" aria-hidden="true" />
        </span>
        <p className="min-w-0 flex-1 text-pretty text-sm text-foreground">
          {fill(t('verifyBanner'), { email: user.email })}
        </p>
        {sent ? (
          <p role="status" className="text-sm font-medium text-muted-foreground">{t('verifySent')}</p>
        ) : (
          <Button variant="secondary" className="h-11 rounded-xl sm:h-9" disabled={send.isPending} onClick={() => send.mutate()}>
            {send.isPending && <Loader2 className="me-1.5 h-4 w-4 animate-spin" aria-hidden="true" />}
            {t('verifyResend')}
          </Button>
        )}
      </div>
    </section>
  );
}

/**
 * The owner of a shared workspace deleted their account: every remaining member is asked, once they next
 * open the app, whether to keep it. The first to keep it becomes its owner; when all leave, it is deleted.
 */
export function OwnerLeftPrompt() {
  const { t } = useTheme();
  const { workspaces, refreshWorkspaces } = useAuth();
  const [later, setLater] = useState(() => new Set());
  const pending = (workspaces || []).find((ws) => ws.ownerLeft && !later.has(idOf(ws)));

  const answer = useMutation({
    mutationFn: ({ ws, keep }) => (keep ? ascent.workspaces.claim(idOf(ws)) : ascent.workspaces.release(idOf(ws))),
    onSuccess: async (_, { ws, keep }) => {
      toast.success(fill(t(keep ? 'olKept' : 'olLeft'), { workspace: ws.name }));
      await refreshWorkspaces();
    },
    onError: async (err) => {
      toast.error(err?.status === 409 ? t('olTaken') : t('olFailed'));
      if (err?.status === 409) await refreshWorkspaces();
    },
  });

  if (!pending) return null;
  const name = pending.ownerLeft.name || pending.ownerLeft.email || '';
  return (
    <AlertDialog
      open
      onOpenChange={(open) => { if (!open && !answer.isPending) setLater((s) => new Set(s).add(idOf(pending))); }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{fill(t('olTitle'), { name })}</AlertDialogTitle>
          <AlertDialogDescription className="space-y-2 text-pretty">
            <span className="block">{fill(t('olBody'), { workspace: pending.name })}</span>
            <span className="block text-xs">{t('olHint')}</span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button
            variant="ghost"
            className="h-11 rounded-xl sm:h-10"
            disabled={answer.isPending}
            onClick={() => answer.mutate({ ws: pending, keep: false })}
          >
            {t('olLetGo')}
          </Button>
          <Button
            className="h-11 rounded-xl sm:h-10"
            disabled={answer.isPending}
            onClick={() => answer.mutate({ ws: pending, keep: true })}
          >
            {answer.isPending && answer.variables?.keep && <Loader2 className="me-1.5 h-4 w-4 animate-spin" aria-hidden="true" />}
            {t('olKeep')}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
