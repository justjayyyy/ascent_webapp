import React, { useState } from 'react';
import { Loader2, MonitorSmartphone } from 'lucide-react';
import { toast } from 'sonner';
import { ascent } from '@/api/client';
import { Button } from '@/components/ui/button';
import { useTheme } from '../ThemeProvider';
import { Row } from '../settings/SettingsShell';

// Settings > Account: you can be signed in on several devices; this ends every session but this one
export default function SignOutOthersRow() {
  const { t } = useTheme();
  const [busy, setBusy] = useState(false);

  const signOutOthers = async () => {
    setBusy(true);
    try {
      await ascent.auth.signOutOtherDevices();
      toast.success(t('setSignedOutOthers'));
    } catch {
      toast.error(t('setSignOutOthersFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Row label={t('setSignOutOthers')} description={t('setSignOutOthersDesc')}>
      <Button variant="outline" onClick={signOutOthers} disabled={busy} className="h-11 rounded-xl sm:h-9">
        {busy
          ? <Loader2 className="me-1.5 h-4 w-4 animate-spin" aria-hidden="true" />
          : <MonitorSmartphone className="me-1.5 h-4 w-4" aria-hidden="true" />}
        {t('setSignOutOthers')}
      </Button>
    </Row>
  );
}
