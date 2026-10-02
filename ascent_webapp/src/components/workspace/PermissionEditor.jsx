import React from 'react';
import { Check } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { useTheme } from '../ThemeProvider';
import { Segmented } from '../settings/SettingsShell';
import { cn } from '@/lib/utils';
import { AREAS, detectPreset, levelOf, presetFor, withLevel } from './utils';

const PRESET_COPY = {
  admin: 'wsRoleAdminDesc',
  editor: 'wsRoleEditorDesc',
  viewer: 'wsRoleViewerDesc',
  custom: 'wsRoleCustomDesc',
};
const PRESET_LABEL = { admin: 'wsAdmin', editor: 'wsEditor', viewer: 'wsViewer', custom: 'wsCustom' };

export const presetOf = (role, permissions) => (role === 'admin' ? 'admin' : detectPreset(permissions));

// Value is { role, permissions }. Picking a preset applies its permissions; "Custom" opens the per-area matrix.
export default function PermissionEditor({ value, onChange, canGrantAdmin = false }) {
  const { t } = useTheme();
  const preset = presetOf(value.role, value.permissions);
  // Portfolio permissions stay in stored data from older versions, but there is no Portfolio to grant
  const areas = AREAS.filter((a) => a !== 'Portfolio');
  const options = [canGrantAdmin && 'admin', 'editor', 'viewer', 'custom'].filter(Boolean);
  if (preset === 'admin' && !options.includes('admin')) options.unshift('admin');

  const pick = (next) => {
    if (next === preset) return;
    if (next === 'admin') onChange({ role: 'admin', permissions: presetFor('admin') });
    else if (next === 'custom') {
      const base = presetFor(preset === 'admin' ? 'editor' : preset);
      onChange({ role: value.role === 'admin' ? 'editor' : value.role, permissions: { ...base, ...(preset === 'admin' ? {} : value.permissions) } });
    } else onChange({ role: next, permissions: presetFor(next) });
  };

  const setPerms = (permissions) => {
    const anyEdit = AREAS.some((a) => permissions[`edit${a}`]);
    onChange({ role: anyEdit ? 'editor' : 'viewer', permissions });
  };

  return (
    <div className="space-y-4">
      <div role="radiogroup" aria-label={t('wsRoleLabel')} className="grid gap-2">
        {options.map((key) => {
          const active = preset === key;
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={key === 'admin' && !canGrantAdmin}
              onClick={() => pick(key)}
              className={cn(
                'flex min-h-11 items-start gap-3 rounded-2xl border p-3 text-start outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60',
                active ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/60'
              )}
            >
              <span
                className={cn(
                  'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
                  active ? 'border-primary bg-primary text-primary-foreground' : 'border-border'
                )}
                aria-hidden="true"
              >
                {active && <Check className="h-3 w-3" />}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-foreground">{t(PRESET_LABEL[key])}</span>
                <span className="block text-sm text-muted-foreground text-pretty">{t(PRESET_COPY[key])}</span>
              </span>
            </button>
          );
        })}
      </div>

      {preset === 'custom' && (
        <div className="space-y-3 rounded-2xl border border-border bg-muted/30 p-3">
          {areas.map((area) => (
            <div key={area} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-sm font-medium text-foreground">{t(`wsArea${area}`)}</span>
              <Segmented
                label={t(`wsArea${area}`)}
                value={levelOf(value.permissions, area)}
                onValueChange={(level) => level && setPerms(withLevel(value.permissions, area, level))}
                options={[
                  { value: 'none', label: t('wsLevelNone') },
                  { value: 'view', label: t('wsLevelView') },
                  { value: 'edit', label: t('wsLevelEdit') },
                ]}
              />
            </div>
          ))}
          <div className="border-t border-border/60 pt-3">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('wsExtras')}</p>
            {[['viewSettings', 'wsViewSettings'], ['manageCards', 'wsManageCards']].map(([key, label]) => (
              <label key={key} className="flex min-h-11 items-center justify-between gap-3 text-sm text-foreground">
                {t(label)}
                <Switch checked={!!value.permissions[key]} onCheckedChange={(on) => setPerms({ ...value.permissions, [key]: on })} />
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
