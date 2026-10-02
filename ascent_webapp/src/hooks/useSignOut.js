import { useCallback } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useTheme } from '@/components/ThemeProvider';
import { useOutbox } from '@/lib/offline/txOutbox';

/**
 * Signing out on purpose, from anywhere (sidebar, Settings). It forgets this device's copy of the data,
 * including changes that never synced, so it asks first when there are any. Resolves false if not.
 */
export function useSignOut() {
  const { t } = useTheme();
  const { logout } = useAuth();
  const { pending } = useOutbox();
  return useCallback(() => {
    if (pending > 0 && !window.confirm(t('offLogoutWarning').replace('{count}', pending))) return false;
    logout(false);
    return true;
  }, [pending, logout, t]);
}
