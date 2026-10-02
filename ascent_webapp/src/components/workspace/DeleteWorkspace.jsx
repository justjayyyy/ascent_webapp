import React, { useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { ascent } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAuth } from '@/lib/AuthContext';
import { rememberWorkspace } from '@/lib/session';
import { useTheme } from '../ThemeProvider';
import { Row } from '../settings/SettingsShell';

const fill = (text, vars) => Object.entries(vars).reduce((s, [k, v]) => s.replace(`{${k}}`, v), text);

// Settings > Household: the owner deletes the workspace and all its data, confirmed by typing its name
export default function DeleteWorkspaceRow() {
  const { t } = useTheme();
  const { currentWorkspace } = useAuth();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const name = currentWorkspace?.name || '';
  const workspaceId = currentWorkspace?.id || currentWorkspace?._id;
  const matches = typed.trim() === name.trim();

  const confirm = async () => {
    if (!matches || busy || !workspaceId) return;
    setBusy(true);
    try {
      await ascent.workspaces.delete(workspaceId);
      toast.success(t('wsDeleted'));
      // Like leaving: the app reopens on another workspace, or makes a fresh one if none is left
      rememberWorkspace(null);
      window.location.assign('/');
    } catch (err) {
      toast.error(err?.message || t('wsFailed'));
      setBusy(false);
    }
  };

  return (
    <>
      <Row label={t('wsDelete')} description={t('wsDeleteDesc')}>
        <Button
          variant="outline"
          onClick={() => { setTyped(''); setOpen(true); }}
          className="h-11 rounded-xl border-danger/40 text-danger hover:bg-danger/10 hover:text-danger sm:h-9"
        >
          <Trash2 className="me-1.5 h-4 w-4" aria-hidden="true" />
          {t('wsDelete')}
        </Button>
      </Row>
      <AlertDialog open={open} onOpenChange={(o) => { if (!busy) setOpen(o); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{fill(t('wsDeleteTitle'), { workspace: name })}</AlertDialogTitle>
            <AlertDialogDescription className="text-pretty">{t('wsDeleteBody')}</AlertDialogDescription>
          </AlertDialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); confirm(); }} className="space-y-2">
            <label htmlFor="delete-workspace-name" className="text-sm text-muted-foreground">
              {fill(t('wsDeleteTypeName'), { workspace: name })}
            </label>
            <Input
              id="delete-workspace-name"
              autoComplete="off"
              spellCheck={false}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className="h-11"
            />
          </form>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy} className="h-11 rounded-xl sm:h-10">{t('cancel')}</AlertDialogCancel>
            <Button
              onClick={confirm}
              disabled={!matches || busy}
              className="h-11 rounded-xl bg-danger text-white hover:bg-danger/90 sm:h-10"
            >
              {busy && <Loader2 className="me-1.5 h-4 w-4 animate-spin" aria-hidden="true" />}
              {t('wsDeleteConfirm')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
