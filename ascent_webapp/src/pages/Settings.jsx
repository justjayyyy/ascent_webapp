import React, { useState, useEffect, useRef } from 'react';
import { ascent } from '@/api/client';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Loader2, User, Bell, Palette, Users, CreditCard, Database, LogOut, Search, X, Lock, Mail, SearchX, UserCircle, Smartphone, ShieldCheck,
} from 'lucide-react';
import { PORTFOLIO_ENABLED } from '@/lib/features';
import ImportExportSection from '../components/settings/ImportExportSection';
import MembersSection from '../components/workspace/MembersSection';
import { roleLabel as memberRoleLabel } from '../components/workspace/utils';
import CardManagement from '../components/settings/CardManagement';
import ApplePaySection from '../components/settings/ApplePaySection';
import HouseholdSmartSettings from '../components/settings/HouseholdSmartSettings';
import ThemePicker from '../components/settings/ThemePicker';
import SecuritySection from '../components/settings/SecuritySection';
import SettingsNav, { useActiveSection } from '../components/settings/SettingsNav';
import { Section, Group, Row, Segmented, EditableField } from '../components/settings/SettingsShell';
import { useTheme } from '../components/ThemeProvider';
import { useAuth } from '@/lib/AuthContext';
import { toast } from 'sonner';
import AscentLogo from '@/components/AscentLogo';

const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'he', label: 'עברית' },
  { value: 'ru', label: 'Русский' },
];

const CURRENCIES = [
  { value: 'USD', label: '$ USD' },
  { value: 'EUR', label: '€ EUR' },
  { value: 'GBP', label: '£ GBP' },
  { value: 'ILS', label: '₪ ILS' },
];

export default function Settings() {
  const { user: themeUser, theme, setPalette, t, loading: themeLoading, saveUserPrefs, refreshUser } = useTheme();
  const { currentWorkspace, setCurrentWorkspace, currentMember, isWorkspaceOwner: isOwner, hasPermission, refreshWorkspaces, logout } = useAuth();
  const [user, setUser] = useState(null);
  const [query, setQuery] = useState('');
  const searchRef = useRef(null);

  useEffect(() => {
    if (themeUser) setUser(themeUser);
  }, [themeUser]);

  // "/" jumps to search, like the rest of the tools people live in.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      const el = document.activeElement;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const updateUserMutation = useMutation({
    mutationFn: async (data) => {
      setUser((prev) => ({ ...prev, ...data }));
      return saveUserPrefs(data); // shows at once, then saves
    },
    onSuccess: async () => {
      await refreshUser();
      toast.success(t('setSaved'));
    },
    onError: async (error) => {
      console.error('Update error:', error);
      await refreshUser(); // revert to server truth
      toast.error(t('setUpdateFailed'));
    },
  });
  const saveUser = updateUserMutation.mutate;


  const updateWorkspaceMutation = useMutation({
    mutationFn: async (name) => {
      if (!currentWorkspace) return;
      return ascent.workspaces.update(currentWorkspace.id || currentWorkspace._id, { name });
    },
    onMutate: async (name) => {
      const previousWorkspace = currentWorkspace;
      if (currentWorkspace) setCurrentWorkspace((prev) => ({ ...prev, name }));
      return { previousWorkspace };
    },
    onSuccess: async () => {
      await refreshWorkspaces();
      toast.success(t('setSaved'));
    },
    onError: (error, variables, context) => {
      if (context?.previousWorkspace) setCurrentWorkspace(context.previousWorkspace);
      toast.error(t('wsRenameFailed'));
    },
  });

  const selectLook = (id) => {
    if (id === 'light') {
      if (theme !== 'light') saveUser({ theme: 'light' });
      return;
    }
    setPalette(id);
    if (theme === 'light') saveUser({ theme: 'dark' });
  };

  // ---- search: a section shows if its title matches (then all rows) or any of its rows match ----
  const q = query.trim().toLowerCase();
  const hit = (...texts) => !q || texts.some((x) => x && String(x).toLowerCase().includes(q));

  const notificationRows = [
    PORTFOLIO_ENABLED && { key: 'priceAlerts', label: t('priceAlerts'), desc: t('getNotifiedPriceChanges'), checked: user?.priceAlerts || false },
    { key: 'dailySummary', label: t('dailySummary'), desc: t('receiveDailyReports'), checked: user?.dailySummary !== false },
    { key: 'weeklyReports', label: t('weeklySummary'), desc: t('receiveWeeklyReports'), checked: user?.weeklyReports !== false },
    { key: 'emailNotifications', label: t('emailNotifications'), desc: t('receiveImportantUpdates'), checked: user?.emailNotifications !== false },
  ].filter(Boolean);

  const roleLabel = memberRoleLabel(t, isOwner ? 'owner' : currentMember?.role);
  const show = {
    profile: hit(t('setNavProfile'), t('fullName'), t('email'), roleLabel),
    appearance: hit(t('setNavAppearance'), t('setThemeLabel'), t('language'), t('defaultCurrency'), t('blurValues'), t('paletteIndigo'), t('paletteGold'), t('paletteGraphite'), t('paletteIvory'), t('paletteBurgundy'), t('paletteSlate'), t('paletteTwilight'), t('light'), t('dark')),
    notifications: hit(t('setNavNotifications'), ...notificationRows.flatMap((r) => [r.label, r.desc])),
    household: hit(t('setNavHousehold'), t('workspaceName'), t('wsMembers'), t('wsInviteMember')),
    cards: hasPermission('manageCards') && hit(t('setNavCards'), t('paymentCards'), t('addCard')),
    applepay: hasPermission('editExpenses') && hit('Apple Pay', t('apDesc')),
    security: hit(t('secTitle'), t('secLockLabel').replace('{method}', ''), t('secPasskeys'), 'Face ID', 'passkey'),
    data: hit(t('setNavData'), t('exportData'), t('expenses'), t('notes'), 'csv'),
    account: hit(t('setNavAccount'), t('logout')),
  };
  const sectionHit = (title) => !q || title.toLowerCase().includes(q);

  const navItems = [
    { id: 'profile', label: t('setNavProfile'), icon: UserCircle },
    { id: 'appearance', label: t('setNavAppearance'), icon: Palette },
    { id: 'notifications', label: t('setNavNotifications'), icon: Bell },
    { id: 'household', label: t('setNavHousehold'), icon: Users },
    hasPermission('manageCards') && { id: 'cards', label: t('setNavCards'), icon: CreditCard },
    hasPermission('editExpenses') && { id: 'applepay', label: 'Apple Pay', icon: Smartphone },
    { id: 'security', label: t('secTitle'), icon: ShieldCheck },
    { id: 'data', label: t('setNavData'), icon: Database },
    { id: 'account', label: t('setNavAccount'), icon: User },
  ].filter((i) => i && show[i.id]);

  const [active, setActive] = useActiveSection(navItems.map((i) => i.id));

  if (!user || themeLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-label={t('loading')} />
      </div>
    );
  }

  const displayName = user.full_name || user.email?.split('@')[0] || '';
  const initials = (displayName.match(/\p{L}/gu) || ['?']).slice(0, 2).join('').toUpperCase();
  let order = 0;

  return (
    <div className="mx-auto max-w-5xl px-4 pb-16 pt-6 md:px-8 md:pt-10">
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground text-balance md:text-4xl">{t('settings')}</h1>
          <p className="mt-1 text-muted-foreground text-pretty">{t('manageAccountPreferences')}</p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') { setQuery(''); e.currentTarget.blur(); } }}
            placeholder={t('setSearch')}
            aria-label={t('setSearch')}
            aria-keyshortcuts="/"
            className="h-11 w-full rounded-2xl border border-border bg-card ps-10 pe-11 text-base text-foreground shadow-sm outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30 md:text-sm [&::-webkit-search-cancel-button]:hidden"
          />
          {q ? (
            <button
              type="button"
              onClick={() => { setQuery(''); searchRef.current?.focus(); }}
              aria-label={t('setClearSearch')}
              className="absolute end-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-4 w-4" />
            </button>
          ) : (
            <kbd
              title={t('setShortcutHint')}
              className="pointer-events-none absolute end-3 top-1/2 hidden h-5 min-w-5 -translate-y-1/2 items-center justify-center rounded-md border border-border bg-muted px-1.5 font-sans text-[11px] font-medium text-muted-foreground sm:flex [@media(pointer:coarse)]:hidden"
            >
              /
            </kbd>
          )}
        </div>
      </header>

      {navItems.length > 0 && <SettingsNav variant="strip" items={navItems} active={active} onSelect={setActive} />}

      <div className="lg:grid lg:grid-cols-[12rem_minmax(0,1fr)] lg:gap-12">
        {navItems.length > 0 && <SettingsNav items={navItems} active={active} onSelect={setActive} />}

        <div className="min-w-0 space-y-10">
          {navItems.length === 0 && (
            <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-border px-6 py-16 text-center" role="status">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                <SearchX className="h-5 w-5" aria-hidden="true" />
              </span>
              <p className="text-foreground">{t('setNoResults')}</p>
              <Button variant="secondary" onClick={() => setQuery('')} className="h-11 rounded-xl">{t('setClearSearch')}</Button>
            </div>
          )}

          {/* Profile */}
          {show.profile && (
            <Section id="profile" index={order++} icon={UserCircle} title={t('setNavProfile')} description={t('setProfileDesc')}>
              <Group>
                <div className="flex items-center gap-4 px-4 py-5 sm:px-5">
                  <span
                    className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-lg font-semibold text-primary"
                    aria-hidden="true"
                  >
                    {initials}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-lg font-semibold tracking-tight text-foreground">{displayName}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {currentWorkspace?.name || user.email}
                    </p>
                  </div>
                  <Badge variant="outline" className="shrink-0 rounded-full border-primary/40 bg-primary/10 px-3 py-1 text-primary">
                    {roleLabel}
                  </Badge>
                </div>
                {(sectionHit(t('setNavProfile')) || hit(t('fullName'))) && (
                  <Row label={t('fullName')} htmlFor="settings-full-name" wide>
                    <EditableField
                      id="settings-full-name"
                      value={user.full_name || ''}
                      placeholder={t('setNamePlaceholder')}
                      icon={User}
                      onSave={(v) => updateUserMutation.mutateAsync({ full_name: v })}
                    />
                  </Row>
                )}
                {(sectionHit(t('setNavProfile')) || hit(t('email'))) && (
                  <Row label={t('email')} description={t('setEmailLocked')} wide>
                    <div className="flex h-11 items-center gap-2 rounded-xl bg-muted/60 px-3 text-sm text-muted-foreground sm:h-10 sm:w-64" dir="ltr">
                      <Mail className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate">{user.email}</span>
                      <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    </div>
                  </Row>
                )}
              </Group>
            </Section>
          )}

          {/* Appearance */}
          {show.appearance && (
            <Section id="appearance" index={order++} icon={Palette} title={t('setNavAppearance')} description={t('setAppearanceDesc')}>
              <Group>
                {(sectionHit(t('setNavAppearance')) || hit(t('setThemeLabel'), t('paletteIndigo'), t('paletteGold'), t('paletteGraphite'), t('paletteIvory'), t('paletteBurgundy'), t('paletteSlate'), t('paletteTwilight'), t('light'), t('dark'))) && (
                  <div className="px-4 py-4 sm:px-5">
                    <p className="text-sm font-medium text-foreground">{t('setThemeLabel')}</p>
                    <p className="mb-3 mt-0.5 text-sm text-muted-foreground">{t('setThemeDesc')}</p>
                    <ThemePicker onSelect={selectLook} />
                  </div>
                )}
                {(sectionHit(t('setNavAppearance')) || hit(t('language'))) && (
                  <Row label={t('language')} description={t('displayLanguage')} wide>
                    <Segmented
                      label={t('language')}
                      value={user.language || 'he'}
                      onValueChange={(value) => saveUser({ language: value })}
                      options={LANGUAGES}
                    />
                  </Row>
                )}
                {(sectionHit(t('setNavAppearance')) || hit(t('defaultCurrency'))) && (
                  <Row label={t('defaultCurrency')} description={t('setCurrencyDesc')} wide>
                    <Segmented
                      label={t('defaultCurrency')}
                      value={user.currency || 'ILS'}
                      onValueChange={(value) => saveUser({ currency: value })}
                      options={CURRENCIES.map((c) => ({ ...c, label: <span dir="ltr" className="tabular-nums">{c.label}</span> }))}
                    />
                  </Row>
                )}
                {(sectionHit(t('setNavAppearance')) || hit(t('blurValues'), t('setPrivacyDesc'))) && (
                  <Row label={t('blurValues')} description={t('setPrivacyDesc')} htmlFor="settings-blur">
                    <Switch
                      id="settings-blur"
                      checked={user.blurValues || false}
                      onCheckedChange={(checked) => saveUser({ blurValues: checked })}
                    />
                  </Row>
                )}
              </Group>
            </Section>
          )}

          {/* Notifications */}
          {show.notifications && (
            <Section id="notifications" index={order++} icon={Bell} title={t('setNavNotifications')} description={t('setNotificationsDesc')}>
              <Group>
                {notificationRows
                  .filter((r) => sectionHit(t('setNavNotifications')) || hit(r.label, r.desc))
                  .map((r) => (
                    <Row key={r.key} label={r.label} description={r.desc} htmlFor={`settings-${r.key}`}>
                      <Switch
                        id={`settings-${r.key}`}
                        checked={r.checked}
                        onCheckedChange={(checked) => saveUser({ [r.key]: checked })}
                      />
                    </Row>
                  ))}
              </Group>
            </Section>
          )}

          {/* Household: workspace + shared access */}
          {show.household && (
            <Section id="household" index={order++} icon={Users} title={t('setNavHousehold')} description={t('setHouseholdDesc')}>
              <Group>
                {(sectionHit(t('setNavHousehold')) || hit(t('workspaceName'))) && (
                  <Row label={t('workspaceName')} htmlFor="settings-workspace-name" wide>
                    <EditableField
                      id="settings-workspace-name"
                      value={currentWorkspace?.name || ''}
                      icon={Users}
                      disabled={!isOwner}
                      onSave={(v) => updateWorkspaceMutation.mutateAsync(v)}
                    />
                  </Row>
                )}
                {(sectionHit(t('setNavHousehold')) || hit(t('wsMembers'), t('wsInviteMember'))) && (
                  <div>
                    <MembersSection />
                  </div>
                )}
                {(sectionHit(t('setNavHousehold')) || hit(t('aiTitle'), t('largeAlertTitle'))) && <HouseholdSmartSettings />}
              </Group>
            </Section>
          )}

          {/* Cards */}
          {show.cards && <CardManagement index={order++} />}

          {/* Apple Pay */}
          {show.applepay && <ApplePaySection index={order++} />}

          {/* Data */}
          {show.data && (
            <ImportExportSection index={order++} />
          )}

          {show.security && <SecuritySection index={order++} />}

          {/* Account */}
          {show.account && (
            <Section id="account" index={order++} icon={User} title={t('setNavAccount')} description={t('setAccountDesc')}>
              <Group>
                <Row label={t('logout')} description={t('setSignOutDesc')}>
                  <Button
                    variant="outline"
                    onClick={() => logout()}
                    className="h-11 rounded-xl border-danger/40 text-danger hover:bg-danger/10 hover:text-danger sm:h-9"
                  >
                    <LogOut className="me-1.5 h-4 w-4 rtl:-scale-x-100" aria-hidden="true" />
                    {t('logout')}
                  </Button>
                </Row>
              </Group>
              <div className="mt-8 flex items-center justify-center gap-3 text-center">
                <AscentLogo motion="full" className="w-12" />
                <div className="text-start">
                  <p className="text-sm font-medium text-foreground">Ascent</p>
                  <p className="text-xs text-muted-foreground">{t('ascendTagline')} · v1.0.0</p>
                </div>
              </div>
            </Section>
          )}
        </div>
      </div>

    </div>
  );
}
