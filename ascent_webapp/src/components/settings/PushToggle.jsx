import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bell, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { ascent } from '@/api/client';
import { Button } from '@/components/ui/button';
import { useTheme } from '../ThemeProvider';
import { Row } from './SettingsShell';

const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => window.navigator.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches;

function keyToBytes(base64Url) {
  const padded = base64Url.padEnd(base64Url.length + ((4 - (base64Url.length % 4)) % 4), '=').replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

// Each step of turning notifications on gets a time limit: on iPhone a step can wait forever without
// failing, which left the button spinning. `step` says which one stalled, for the message.
const within = (promise, ms, step) => {
  let timer;
  const stalled = new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error(`${step} stalled`), { step })), ms); });
  return Promise.race([promise, stalled]).finally(() => clearTimeout(timer));
};

/** The app's service worker, started here when this phone never started it. */
async function workerReady() {
  if (!(await navigator.serviceWorker.getRegistration())) await navigator.serviceWorker.register('/sw.js');
  return within(navigator.serviceWorker.ready, 15000, 'worker');
}

const STEP_ERRORS = { worker: 'apPushNoWorker', subscribe: 'apPushNoApple' };

/** Turns push notifications on or off for this device (a phone needs Ascent on its Home Screen). */
export default function PushToggle() {
  const { t } = useTheme();
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [denied, setDenied] = useState(typeof Notification !== 'undefined' && Notification.permission === 'denied');
  const supported = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const needsInstall = isIos() && !isStandalone();

  const { data: config } = useQuery({ queryKey: ['push-config'], queryFn: () => ascent.push.config(), staleTime: 5 * 60 * 1000 });

  useEffect(() => {
    if (!supported) return;
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setSubscribed(!!sub))
      .catch(() => {});
  }, [supported]);

  const enable = async () => {
    setBusy(true);
    try {
      const permission = await within(Notification.requestPermission(), 60000, 'permission');
      if (permission !== 'granted') { setDenied(true); return; }
      const reg = await workerReady();
      const sub = (await reg.pushManager.getSubscription())
        || (await within(reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(config.publicKey) }), 20000, 'subscribe'));
      await ascent.push.subscribe(sub.toJSON());
      setSubscribed(true);
    } catch (err) {
      toast.error(t(STEP_ERRORS[err?.step] || 'apPushFailed'));
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      const reg = await workerReady();
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await ascent.push.unsubscribe(sub.endpoint).catch(() => {});
        await sub.unsubscribe();
      }
      setSubscribed(false);
    } catch {
      toast.error(t('apPushFailed'));
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    try {
      await ascent.push.test();
      toast.success(t('apPushSent'));
    } catch {
      toast.error(t('apPushFailed'));
    }
  };

  let hint = t('apPushDesc');
  let control = null;
  if (!supported) hint = needsInstall ? t('apPushNeedsInstall') : t('apPushUnsupported');
  else if (config && !config.enabled) hint = t('apPushNotConfigured');
  else if (denied) hint = t('apPushDenied');
  else if (needsInstall && !subscribed) hint = t('apPushNeedsInstall');
  else if (config) {
    control = subscribed ? (
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={test} className="h-11 rounded-xl sm:h-9">{t('apPushTest')}</Button>
        <Button variant="outline" onClick={disable} disabled={busy} className="h-11 rounded-xl sm:h-9">{t('apPushDisable')}</Button>
      </div>
    ) : (
      <Button onClick={enable} disabled={busy} className="h-11 rounded-xl sm:h-9">
        {busy ? <Loader2 className="animate-spin" /> : <Bell />}
        {t('apPushEnable')}
      </Button>
    );
  }

  return (
    <Row label={t('apPushTitle')} description={subscribed ? t('apPushOn') : hint} wide>
      {control}
    </Row>
  );
}
