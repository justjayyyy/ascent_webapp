import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, History, KeyRound, ListOrdered, Loader2, MessageSquareText, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { ascent } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useTheme } from '../ThemeProvider';
import { Section, Group, Row, Disclosure } from './SettingsShell';
import PushToggle from './PushToggle';

function CopyField({ label, value, t, mono = true }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setDone(true);
      setTimeout(() => setDone(false), 1800);
    } catch {
      toast.error(t('ntCopyFailed'));
    }
  };
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex gap-2">
        <Input readOnly value={value} dir="ltr" onFocus={(e) => e.target.select()} aria-label={label}
          className={mono ? 'h-11 font-mono text-[13px] sm:h-10' : 'h-11 sm:h-10'} />
        <Button type="button" variant="outline" onClick={copy} className="h-11 shrink-0 rounded-xl px-3 sm:h-10">
          {done ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          <span className="sr-only">{t('apCopy')}</span>
        </Button>
      </div>
    </div>
  );
}

/** Devices whose Shortcut reports Apple Pay taps; each purchase lands in Expenses marked "Needs review". */
export default function ApplePaySection({ index }) {
  const { t, language } = useTheme();
  const queryClient = useQueryClient();
  const [label, setLabel] = useState('');
  const [freshKey, setFreshKey] = useState(null);
  const [toRemove, setToRemove] = useState(null);
  const url = `${window.location.origin}/api/ingest/wallet`;
  const smsUrl = `${window.location.origin}/api/ingest/sms`;

  const { data: tokens = [] } = useQuery({ queryKey: ['ingest-tokens'], queryFn: () => ascent.ingestTokens.list(), staleTime: 15 * 1000 });
  const { data: activity = [] } = useQuery({ queryKey: ['ingest-activity'], queryFn: () => ascent.ingestTokens.activity(), staleTime: 15 * 1000, refetchInterval: 30 * 1000 });
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['ingest-tokens'] });
    queryClient.invalidateQueries({ queryKey: ['ingest-activity'] });
  };

  const create = useMutation({
    mutationFn: () => ascent.ingestTokens.create(label.trim() || t('apDevicePlaceholder')),
    onSuccess: (res) => { setFreshKey(res.token); setLabel(''); refresh(); },
    onError: (e) => toast.error(e?.data?.error === 'token_limit' ? t('apDeviceLimit') : t('apFailed')),
  });
  const revoke = useMutation({
    mutationFn: (id) => ascent.ingestTokens.revoke(id),
    onSuccess: () => { setFreshKey(null); refresh(); toast.success(t('apRevoked')); },
    onError: () => toast.error(t('apFailed')),
  });

  const when = (d) => new Date(d).toLocaleString(language, { dateStyle: 'medium', timeStyle: 'short' });
  const money = (a, c) => { try { return new Intl.NumberFormat(language, { style: 'currency', currency: c }).format(a); } catch { return `${a} ${c}`; } };

  return (
    <Section id="applepay" index={index} icon={Smartphone} title="Apple Pay" description={t('apDesc')}>
      <Group>
        <div className="px-4 pt-4 text-xs font-medium text-muted-foreground sm:px-5">{t('apDevices')}</div>
        {tokens.length === 0 && <p className="px-4 py-3 text-sm text-muted-foreground sm:px-5">{t('apNoDevices')}</p>}
        {tokens.map((tok) => (
          <Row
            key={tok.id}
            label={<span>{tok.label} <span dir="ltr" className="font-mono text-xs text-muted-foreground">{tok.prefix}…</span></span>}
            description={tok.lastUsedAt ? fmtLast(t('apLastUsed'), when(tok.lastUsedAt)) : t('apNeverUsed')}
          >
            <Button variant="outline" onClick={() => setToRemove(tok)} className="h-11 rounded-xl border-danger/40 text-danger hover:bg-danger/10 hover:text-danger sm:h-9">
              {t('apRevoke')}
            </Button>
          </Row>
        ))}

        <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="flex gap-2 px-4 py-4 sm:px-5">
          <Input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} aria-label={t('apDeviceName')}
            placeholder={t('apDevicePlaceholder')} className="h-11 flex-1 rounded-xl sm:h-10" />
          <Button type="submit" disabled={create.isPending} className="h-11 shrink-0 rounded-xl sm:h-10">
            {create.isPending ? <Loader2 className="animate-spin" /> : <KeyRound />}
            {t('apAddDevice')}
          </Button>
        </form>

        <PushToggle />

        {freshKey && (
          <div className="space-y-4 px-4 py-4 sm:px-5">
            <CopyField label={t('apKey')} value={freshKey} t={t} />
            <p className="text-xs text-muted-foreground">{t('apKeyShownOnce')}</p>
          </div>
        )}
        {tokens.length > 0 && (
          <div className="px-4 py-4 sm:px-5"><CopyField label={t('apUrl')} value={url} t={t} /></div>
        )}

        <Disclosure label={t('apHowTitle')} icon={ListOrdered}>
          <Steps n={5} prefix="apStep" t={t} />
          <p className="mt-4 text-sm text-muted-foreground text-pretty">{t('apCategoryNote')}</p>
        </Disclosure>

        {/* Card company SMS alerts: the same device keys, a different address */}
        <Disclosure label={t('smsTitle')} icon={MessageSquareText}>
          <p className="text-sm text-muted-foreground text-pretty">{t('smsDesc')}</p>
          {tokens.length > 0 && <div className="mt-3"><CopyField label={t('smsUrl')} value={smsUrl} t={t} /></div>}
          <Steps n={4} prefix="smsStep" t={t} />
          <p className="mt-4 text-sm text-muted-foreground text-pretty">{t('smsNote')}</p>
        </Disclosure>

        <Disclosure
          label={t('apActivity')}
          icon={History}
          summary={activity.length > 0 && <span className="tabular-nums">{Math.min(activity.length, 10)}</span>}
        >
          {activity.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('apActivityEmpty')}</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {activity.slice(0, 10).map((ev) => (
                <li key={ev.id} className="py-2 text-sm">
                  <p className="truncate text-foreground">
                    {ev.summary?.merchant || t('apNoMerchant')}
                    {ev.summary?.amount != null && <span className="ms-2 tabular-nums text-muted-foreground" dir="ltr">{money(ev.summary.amount, ev.summary.currency)}</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">{t(`apOutcome_${ev.outcome}`)} · {when(ev.createdAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </Disclosure>
      </Group>

      <AlertDialog open={!!toRemove} onOpenChange={(o) => !o && setToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('apRevoke')}: {toRemove?.label}</AlertDialogTitle>
            <AlertDialogDescription>{t('apRevokeConfirm')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => { revoke.mutate(toRemove.id); setToRemove(null); }}>{t('apRevoke')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Section>
  );
}

function Steps({ n, prefix, t }) {
  return (
    <ol className="mt-3 space-y-3 first:mt-0">
      {Array.from({ length: n }, (_, i) => i + 1).map((k) => (
        <li key={k} className="flex gap-3 text-sm text-muted-foreground">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">{k}</span>
          <span className="pt-0.5 text-pretty">{t(`${prefix}${k}`)}</span>
        </li>
      ))}
    </ol>
  );
}

const fmtLast = (template, time) => String(template).replace('{time}', time);
