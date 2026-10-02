import React, { useEffect, useState } from 'react';
import { motion, useReducedMotion } from '@/lib/motion';
import { ScanFace, Fingerprint, KeyRound, Zap, ShieldCheck, CloudOff, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ascent } from '@/api/client';
import { useTheme } from '@/components/ThemeProvider';
import { useAuth } from '@/lib/AuthContext';
import { biometricName, biometricKind, deviceCanUseBiometrics, enableBiometricLock, getLockPrefs } from '@/lib/appLock';

const OFFER_KEY = 'ascent_offer_biometric';
const DECLINED_KEY = 'ascent_biometric_declined';

const declined = (userId) => {
  try { return (JSON.parse(localStorage.getItem(DECLINED_KEY) || '[]') || []).includes(userId); } catch { return false; }
};
const decline = (userId) => {
  try {
    const list = JSON.parse(localStorage.getItem(DECLINED_KEY) || '[]') || [];
    localStorage.setItem(DECLINED_KEY, JSON.stringify([...new Set([...list, userId])]));
  } catch { /* storage unavailable */ }
};

/**
 * Right after a password or Google sign-in on a phone that has Face ID (or a fingerprint reader),
 * offer once to use it from now on. Turning it on makes a passkey here and switches on the app lock.
 */
export default function EnableBiometricPrompt() {
  const { t } = useTheme();
  const { user, loginWithPasskey } = useAuth();
  const queryClient = useQueryClient();
  const reduce = useReducedMotion();
  const userId = user?.id || user?._id;
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const method = biometricName(t);
  const MethodIcon = { face: ScanFace, fingerprint: Fingerprint, key: KeyRound }[biometricKind()];

  useEffect(() => {
    let offer = false;
    try { offer = sessionStorage.getItem(OFFER_KEY) === '1'; sessionStorage.removeItem(OFFER_KEY); } catch { /* storage unavailable */ }
    if (!offer || !userId || getLockPrefs(userId).enabled || declined(userId)) return undefined;
    let cancelled = false;
    deviceCanUseBiometrics().then((ok) => {
      if (ok && !cancelled) setTimeout(() => !cancelled && setOpen(true), 900); // after the welcome toast
    });
    return () => { cancelled = true; };
  }, [userId]);

  const turnOn = async () => {
    setBusy(true);
    try {
      await enableBiometricLock(userId, {
        register: () => ascent.passkeys.register(),
        verify: () => loginWithPasskey(),
      });
      queryClient.invalidateQueries({ queryKey: ['passkeys'] });
      toast.success(t('secLockOn').replace('{method}', method));
      setOpen(false);
    } catch (err) {
      if (err?.name === 'NotAllowedError' || err?.name === 'AbortError') toast(t('secCancelled'));
      else toast.error(t('secFailed'));
    } finally {
      setBusy(false);
    }
  };

  const later = () => {
    decline(userId);
    setOpen(false);
  };

  const points = [
    { icon: Zap, text: t('bioPointFast') },
    { icon: ShieldCheck, text: t('bioPointPrivate') },
    { icon: CloudOff, text: t('bioPointOffline') },
  ];

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) later(); }}>
      <DialogContent className="max-w-sm">
        <div className="flex flex-col items-center pt-2 text-center">
          <motion.span
            className="relative grid h-20 w-20 place-items-center rounded-[1.75rem] bg-primary/[0.12] text-primary ring-1 ring-inset ring-primary/25"
            initial={reduce ? false : { scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 320, damping: 22, delay: 0.1 }}
          >
            <span aria-hidden="true" className="absolute inset-0 rounded-[1.75rem] shadow-[0_12px_40px_-10px_hsl(var(--glow)/0.7)]" />
            <MethodIcon className="h-10 w-10" strokeWidth={1.6} aria-hidden="true" />
          </motion.span>
          <DialogHeader className="mt-5 text-center sm:text-center">
            <DialogTitle className="text-xl text-balance">{t('bioTitle').replace('{method}', method)}</DialogTitle>
            <DialogDescription className="text-pretty">{t('bioDesc')}</DialogDescription>
          </DialogHeader>
        </div>

        <ul className="space-y-3 rounded-2xl bg-foreground/[0.04] p-4">
          {points.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-start gap-3 text-sm">
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              <span className="text-foreground/90 text-pretty">{text}</span>
            </li>
          ))}
        </ul>

        <div className="flex flex-col gap-2">
          <Button onClick={turnOn} disabled={busy} className="h-12 rounded-full text-base">
            {busy ? <Loader2 className="animate-spin" /> : <MethodIcon />}
            {t('bioTurnOn').replace('{method}', method)}
          </Button>
          <Button variant="ghost" onClick={later} disabled={busy} className="h-11 rounded-full text-muted-foreground">
            {t('bioLater')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
