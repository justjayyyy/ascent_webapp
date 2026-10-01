import React, { useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAuth } from '@/lib/AuthContext';
import { useTheme } from '../ThemeProvider';
import { Row } from '../settings/SettingsShell';

const fill = (text, vars) => Object.entries(vars).reduce((s, [k, v]) => s.replace(`{${k}}`, v), text);

// Settings > Account: deleting the account, confirmed by typing its email
export default function DeleteAccountRow() {
  const { t } = useTheme();
  const { user, deleteAccount } = useAuth();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const email = user?.email || '';
  const matches = typed.trim().toLowerCase() === email.toLowerCase();

  const confirm = async () => {
    if (!matches || busy) return;
    setBusy(true);
    try {
      await deleteAccount(typed.trim());
    } catch {
      toast.error(t('delFailed'));
      setBusy(false);
    }
  };

  return (
    <>
      <Row label={t('delTitle')} description={t('delDesc')}>
        <Button
          variant="outline"
          onClick={() => { setTyped(''); setOpen(true); }}
          className="h-11 rounded-xl border-danger/40 text-danger hover:bg-danger/10 hover:text-danger sm:h-9"
        >
          <Trash2 className="me-1.5 h-4 w-4" aria-hidden="true" />
          {t('delTitle')}
        </Button>
      </Row>
      <AlertDialog open={open} onOpenChange={(o) => { if (!busy) setOpen(o); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('delDialogTitle')}</AlertDialogTitle>
            <AlertDialogDescription className="text-pretty">{t('delDialogBody')}</AlertDialogDescription>
          </AlertDialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); confirm(); }} className="space-y-2">
            <label htmlFor="delete-account-email" className="text-sm text-muted-foreground">
              {fill(t('delTypeEmail'), { email })}
            </label>
            <Input
              id="delete-account-email"
              type="email"
              dir="ltr"
              autoComplete="off"
              autoCapitalize="none"
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
              {t('delConfirm')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
