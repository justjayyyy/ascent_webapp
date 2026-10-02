import React, { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAssistStatus } from '@/hooks/useWorkspaceData';
import { toast } from 'sonner';
import { Sparkles, BellRing, Scale } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { ascent } from '@/api/client';
import { useAuth } from '@/lib/AuthContext';
import { useTheme } from '../ThemeProvider';
import { Row } from './SettingsShell';

/** Household-wide options owners and admins set: the AI assistant, splitting expenses and large-expense alerts. */
export default function HouseholdSmartSettings() {
  const { t, user } = useTheme();
  const { currentWorkspace, currentMember, isWorkspaceOwner, refreshWorkspaces } = useAuth();
  const queryClient = useQueryClient();
  const settings = currentWorkspace?.settings || {};
  const canManage = isWorkspaceOwner || currentMember?.role === 'owner' || currentMember?.role === 'admin';
  const currency = settings.largeExpenseCurrency || user?.currency || 'ILS';
  const [threshold, setThreshold] = useState(settings.largeExpenseAlert ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => { setThreshold(settings.largeExpenseAlert ?? ''); }, [settings.largeExpenseAlert]);

  const { data: status } = useAssistStatus();
  const configured = !!status?.ai?.configured;

  const save = async (patch) => {
    if (!currentWorkspace?.id) return;
    setSaving(true);
    try {
      await ascent.workspaces.updateSettings(currentWorkspace.id, patch);
      await refreshWorkspaces();
      queryClient.invalidateQueries({ queryKey: ['assist-status'] });
      toast.success(t('setSaved'));
    } catch {
      toast.error(t('calSaveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const saveThreshold = () => {
    const value = threshold === '' ? null : Number(threshold);
    if ((value ?? null) === (settings.largeExpenseAlert ?? null)) return;
    save({ largeExpenseAlert: value && value > 0 ? value : null, largeExpenseCurrency: currency });
  };

  const managerHint = canManage ? null : t('aiOnlyManagers');

  return (
    <>
      <Row
        label={<span className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" aria-hidden />{t('aiTitle')}</span>}
        description={<>{t('aiDesc')}{!configured && <span className="mt-1 block text-xs">{t('aiNotConfigured')}</span>}{managerHint && <span className="mt-1 block text-xs">{managerHint}</span>}</>}
        htmlFor="settings-ai"
      >
        <Switch
          id="settings-ai"
          checked={!!settings.aiAssistant}
          disabled={!canManage || !configured || saving}
          onCheckedChange={(on) => save({ aiAssistant: on })}
        />
      </Row>
      <Row
        label={<span className="flex items-center gap-2"><Scale className="h-4 w-4 text-primary" aria-hidden />{t('splitSettingTitle')}</span>}
        description={<>{t('splitSettingDesc')}{managerHint && <span className="mt-1 block text-xs">{managerHint}</span>}</>}
        htmlFor="settings-split"
      >
        <Switch
          id="settings-split"
          checked={settings.splitExpenses !== false}
          disabled={!canManage || saving}
          onCheckedChange={(on) => save({ splitExpenses: on })}
        />
      </Row>
      <Row
        label={<span className="flex items-center gap-2"><BellRing className="h-4 w-4 text-primary" aria-hidden />{t('largeAlertTitle')}</span>}
        description={<>{t('largeAlertDesc')}{managerHint && <span className="mt-1 block text-xs">{managerHint}</span>}</>}
        htmlFor="settings-large-alert"
        wide
      >
        <div className="flex items-center gap-2">
          <Input
            id="settings-large-alert"
            type="number"
            inputMode="decimal"
            min="0"
            step="50"
            placeholder={t('largeAlertOff')}
            value={threshold}
            disabled={!canManage || saving}
            onChange={(e) => setThreshold(e.target.value)}
            onBlur={saveThreshold}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
            className="h-11 w-36 rounded-xl tabular-nums sm:h-10"
          />
          <span className="text-sm text-muted-foreground">{currency}</span>
        </div>
      </Row>
    </>
  );
}
