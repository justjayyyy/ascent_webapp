import React, { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, ScanFace, KeyRound, Plus, Trash2, Pencil, Loader2, Cloud } from 'lucide-react';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ascent } from '@/api/client';
import { useTheme } from '@/components/ThemeProvider';
import { useAuth } from '@/lib/AuthContext';
import { useAppLock } from '@/components/security/AppLock';
import {
  LOCK_AFTER_CHOICES, biometricName, deviceCanUseBiometrics, enableBiometricLock, getLockPrefs, rememberCredential, setLockPrefs,
} from '@/lib/appLock';
import { Section, Group, Row, Segmented } from './SettingsShell';

const errorText = (err, t) => {
  if (err?.name === 'NotAllowedError' || err?.name === 'AbortError') return t('secCancelled');
  if (err?.data?.error === 'passkey_limit') return t('secLimit');
  if (err?.data?.error === 'origin_not_allowed') return t('secWrongSite');
  return t('secFailed');
};

/** Settings > Security: the Face ID lock on this device, and the account's passkeys. */
export default function SecuritySection({ index }) {
  const { t, language } = useTheme();
  const { user, loginWithPasskey } = useAuth();
  const { enabled } = useAppLock();
  const queryClient = useQueryClient();
  const userId = user?.id || user?._id;
  const [capable, setCapable] = useState(null);
  const [busy, setBusy] = useState(null); // 'toggle' | 'add' | id
  const [editing, setEditing] = useState(null); // { id, name }
  const [after, setAfter] = useState(() => getLockPrefs(userId).after);
  const method = biometricName(t);
  const locale = language === 'he' ? 'he-IL' : language === 'ru' ? 'ru-RU' : 'en-US';

  useEffect(() => { deviceCanUseBiometrics().then(setCapable); }, []);
  // Options fetched before the tap, so Face ID opens at once (see the API client)
  useEffect(() => {
    if (!capable) return;
    ascent.passkeys.prepareRegister();
    if (!enabled) ascent.auth.preparePasskeyLogin();
  }, [capable, enabled]);

  const { data: passkeys = [], isLoading } = useQuery({
    queryKey: ['passkeys', userId],
    queryFn: () => ascent.passkeys.list(),
    enabled: !!userId,
    staleTime: 60 * 1000,
  });
  const setList = (list) => queryClient.setQueryData(['passkeys', userId], list);

  const register = async () => {
    const result = await ascent.passkeys.register();
    setList(result.list);
    return result;
  };

  const toggle = async (on) => {
    if (!on) {
      setLockPrefs(userId, { enabled: false });
      toast(t('secLockOff'));
      return;
    }
    setBusy('toggle');
    try {
      await enableBiometricLock(userId, { register, verify: () => loginWithPasskey() });
      queryClient.invalidateQueries({ queryKey: ['passkeys', userId] });
      toast.success(t('secLockOn').replace('{method}', method));
    } catch (err) {
      toast.error(errorText(err, t));
    } finally {
      setBusy(null);
    }
  };

  const addPasskey = async () => {
    setBusy('add');
    try {
      const { credentialId } = await register();
      rememberCredential(userId, credentialId);
      toast.success(t('secAdded'));
    } catch (err) {
      toast.error(err?.name === 'InvalidStateError' ? t('secAlreadyHere') : errorText(err, t));
    } finally {
      setBusy(null);
    }
  };

  const remove = async (pk) => {
    setBusy(pk.id);
    try {
      setList(await ascent.passkeys.remove(pk.id));
      // Ask the phone's password manager to forget it too, where the browser supports it
      import('@simplewebauthn/browser')
        .then(({ sendSignal }) => sendSignal({ signalName: 'unknownCredential', rpID: window.location.hostname, credentialID: pk.id }))
        .catch(() => {});
      const prefs = getLockPrefs(userId);
      const left = prefs.credentialIds.filter((id) => id !== pk.id);
      setLockPrefs(userId, { credentialIds: left, enabled: prefs.enabled && left.length > 0 });
      toast.success(t('secRemoved'));
    } catch (err) {
      toast.error(errorText(err, t));
    } finally {
      setBusy(null);
    }
  };

  const saveName = async (e) => {
    e.preventDefault();
    const name = editing.name.trim();
    if (!name) return;
    setBusy(editing.id);
    try {
      setList(await ascent.passkeys.rename(editing.id, name));
      setEditing(null);
    } catch (err) {
      toast.error(errorText(err, t));
    } finally {
      setBusy(null);
    }
  };

  const date = (d) => (d ? new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(d)) : '');
  const afterLabel = (s) => (s === 0 ? t('secAfterNow') : t('secAfterMin').replace('{n}', s / 60));

  return (
    <Section id="security" index={index} icon={ShieldCheck} title={t('secTitle')} description={t('secDesc')}>
      <Group>
        <Row
          htmlFor="lock-switch"
          label={t('secLockLabel').replace('{method}', method)}
          description={capable === false ? t('secNotAvailable') : t('secLockDesc')}
        >
          <div className="flex items-center gap-2">
            {busy === 'toggle' && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden="true" />}
            <Switch id="lock-switch" checked={enabled} disabled={!capable || busy === 'toggle'} onCheckedChange={toggle} />
          </div>
        </Row>

        {enabled && (
          <Row label={t('secAfterLabel')} description={t('secAfterDesc')} wide>
            <Segmented
              label={t('secAfterLabel')}
              value={String(after)}
              onValueChange={(v) => { setAfter(Number(v)); setLockPrefs(userId, { after: Number(v) }); }}
              options={LOCK_AFTER_CHOICES.map((s) => ({ value: String(s), label: afterLabel(s) }))}
            />
          </Row>
        )}

        <div className="px-4 py-4 sm:px-5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{t('secPasskeys')}</p>
              <p className="mt-0.5 text-sm text-muted-foreground text-pretty">{t('secPasskeysDesc')}</p>
            </div>
            <Button variant="outline" onClick={addPasskey} disabled={!capable || busy === 'add'} className="h-11 shrink-0 rounded-xl sm:h-9">
              {busy === 'add' ? <Loader2 className="animate-spin" /> : <Plus />}
              {t('secAdd')}
            </Button>
          </div>

          {isLoading ? (
            <div className="mt-4 h-14 rounded-2xl skeleton-shimmer" />
          ) : passkeys.length === 0 ? (
            <p className="mt-4 flex items-center gap-2 rounded-2xl bg-foreground/[0.04] px-4 py-3 text-sm text-muted-foreground">
              <KeyRound className="h-4 w-4 shrink-0" aria-hidden="true" /> {t('secNone')}
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-border/50">
              {passkeys.map((pk) => (
                <li key={pk.id} className="flex items-center gap-3 py-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
                    <ScanFace className="h-5 w-5" aria-hidden="true" />
                  </span>
                  {editing?.id === pk.id ? (
                    <form onSubmit={saveName} className="flex min-w-0 flex-1 items-center gap-2">
                      <Input
                        autoFocus
                        value={editing.name}
                        maxLength={60}
                        aria-label={t('secRename')}
                        onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                        onKeyDown={(e) => { if (e.key === 'Escape') setEditing(null); }}
                        className="h-10 rounded-xl"
                      />
                      <Button type="submit" disabled={busy === pk.id} className="h-10 rounded-xl">{t('save')}</Button>
                    </form>
                  ) : (
                    <>
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                          {pk.name}
                          {pk.backedUp && <Cloud className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label={t('secSynced')} />}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {t('secCreated').replace('{date}', date(pk.createdAt))}
                          {pk.lastUsedAt ? ` · ${t('secUsed').replace('{date}', date(pk.lastUsedAt))}` : ''}
                        </p>
                      </div>
                      <Button size="icon" variant="ghost" aria-label={t('secRename')} onClick={() => setEditing({ id: pk.id, name: pk.name })}><Pencil /></Button>
                      <Button size="icon" variant="ghost" aria-label={t('secRemove')} disabled={busy === pk.id} onClick={() => remove(pk)} className="text-danger hover:text-danger">
                        {busy === pk.id ? <Loader2 className="animate-spin" /> : <Trash2 />}
                      </Button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-muted-foreground text-pretty">{t('secPrivacyNote')}</p>
        </div>
      </Group>
    </Section>
  );
}
