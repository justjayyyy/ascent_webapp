import React, { useState, useEffect, useMemo, useCallback, lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from './utils';
import { PieChart, Receipt, Settings as SettingsIcon, LogOut, Menu, X, StickyNote, CalendarDays, Moon, Sun, Eye, EyeOff } from 'lucide-react';
import AppSidebar from '@/components/AppSidebar';
import { ascent } from '@/api/client';
import { cn } from '@/lib/utils';
import { useTheme } from './components/ThemeProvider';
import { useAuth } from '@/lib/AuthContext';
import { useSessionTimeout } from './hooks/useSessionTimeout';
import { Switch } from '@/components/ui/switch';
import WelcomeDialog from './components/WelcomeDialog';
import InstallHint from './components/InstallHint';
import AscentLogo from '@/components/AscentLogo';

// The calendar is heavy and only needed on demand
const CalendarModal = lazy(() => import('@/components/GoogleCalendar/CalendarModal'));

const SIDEBAR_KEY = 'ascent.sidebarCollapsed';

function LayoutContent({ children, currentPageName }) {
  const { user, theme, isRTL, colors, t, updateUserLocal, refreshUser } = useTheme();
  const { permissions, hasPermission } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem(SIDEBAR_KEY) === '1'; } catch { return false; }
  });
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarMounted, setCalendarMounted] = useState(false);

  useEffect(() => { if (calendarOpen) setCalendarMounted(true); }, [calendarOpen]);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem(SIDEBAR_KEY, next ? '1' : '0'); } catch { /* storage unavailable */ }
      return next;
    });
  }, []);

  // Ctrl/Cmd + B toggles the sidebar
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'b') {
        const el = document.activeElement;
        if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
        e.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleSidebar]);
  const [showWelcomeDialog, setShowWelcomeDialog] = useState(false);

  // Session timeout - auto logout after 5 minutes of inactivity
  useSessionTimeout(!!user, t);

  // Check for first login welcome message
  useEffect(() => {
    if (user && sessionStorage.getItem('showWelcomeMessage') === 'true') {
      setShowWelcomeDialog(true);
      sessionStorage.removeItem('showWelcomeMessage');
    }
  }, [user]);

  const handleLogout = useCallback(async () => {
    await ascent.auth.logout();
  }, []);

  const handleThemeChange = useCallback(async (checked) => {
    const newTheme = checked ? 'dark' : 'light';
    if (user) {
      try {
        // Update locally first for instant feedback
        updateUserLocal({ theme: newTheme });
        // Then persist to server
        await ascent.auth.updateMe({ theme: newTheme });
      } catch (error) {
        console.error('Failed to update theme');
        // Revert on error by refreshing from server
        await refreshUser();
      }
    }
  }, [user, updateUserLocal, refreshUser]);

  const handleBlurValuesChange = useCallback(async (checked) => {
    if (user) {
      try {
        // Update locally first for instant feedback
        updateUserLocal({ blurValues: checked });
        // Then persist to server
        await ascent.auth.updateMe({ blurValues: checked });
      } catch (error) {
        console.error('Failed to update blur values');
        // Revert on error by refreshing from server
        await refreshUser();
      }
    }
  }, [user, updateUserLocal, refreshUser]);

  // const hasPermission = useCallback((permission) => {
  //   // If no permissions object exists, user is owner and has all permissions
  //   if (!permissions) return true;
  //   // For shared users, check if the specific permission is granted
  //   // Use optional chaining to safely access permissions
  //   return permissions?.[permission] === true;
  // }, [permissions]);

  const navigation = useMemo(() => [
    // Portfolio is hidden for now:
    // { name: t('portfolio'), page: 'Portfolio', icon: Home, permission: 'viewPortfolio' },
    { name: t('dashboard'), page: 'Dashboard', icon: PieChart, permission: 'viewExpenses' },
    { name: t('expenses'), page: 'Expenses', icon: Receipt, permission: 'viewExpenses' },
    { name: t('notes'), page: 'Notes', icon: StickyNote, permission: 'viewNotes' },
    // { name: t('settings'), page: 'Settings', icon: SettingsIcon, permission: 'viewSettings' },
  ].filter(item => hasPermission(item.permission)), [t, hasPermission]);

  return (
    <div className={cn(
      "min-h-dvh md:flex overflow-x-clip transition-colors bg-background text-foreground"
    )} dir={isRTL ? 'rtl' : 'ltr'}>
      <style>{`
        * { -webkit-tap-highlight-color: transparent; }
      `}</style>



      {/* Desktop Sidebar */}
      <AppSidebar
        navigation={navigation}
        currentPageName={currentPageName}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={toggleSidebar}
        onOpenCalendar={() => setCalendarOpen(true)}
        calendarOpen={calendarOpen}
        onLogout={handleLogout}
        onThemeChange={handleThemeChange}
        onBlurChange={handleBlurValuesChange}
      />

      {/* Mobile Header */}
      <div className={cn(
        "md:hidden fixed top-0 start-0 end-0 z-50 border-b safe-area-inset-top",
        "bg-card/85 backdrop-blur-md supports-[backdrop-filter]:bg-card/70",
        colors.border
      )}>
        <div className="flex items-center justify-center h-16 px-4">
          <AscentLogo motion="hover" alt="Ascent logo" className="w-14" />
        </div>
      </div>

      {/* Mobile Menu - Only Settings (Pages are in bottom nav) */}
      <div
        className={cn(
          "md:hidden fixed top-16 bottom-16 z-50 w-1/2 overflow-y-auto transition-transform duration-300 ease-out",
          "end-0",
          mobileMenuOpen
            ? (isRTL ? "translate-x-0" : "translate-x-0")
            : (isRTL ? "-translate-x-full" : "translate-x-full"),
          colors.bgSecondary,
          colors.border,
          isRTL ? "border-r" : "border-l"
        )}
      >
        {user && (
          <div className={cn("p-4", colors.bgSecondary)}>
            {/* User Info */}
            <div className="flex items-center justify-center mb-3 pb-3 border-b border-border">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-semibold">
                {user.full_name?.[0] || user.email[0].toUpperCase()}
              </div>
              <div className="ms-3 flex-1 min-w-0">
                <p className={cn("text-sm font-medium truncate", colors.textPrimary)}>{user.full_name || t('user')}</p>
                <p className={cn("text-xs truncate", colors.textTertiary)}>
                  {permissions ? t('sharedUser') : t('owner')}
                </p>
              </div>
            </div>

            {/* Theme Toggle */}
            <div
              onClick={(e) => {
                e.preventDefault();
                handleThemeChange(theme !== 'dark');
              }}
              className={cn("px-3 py-2 mb-2 flex items-center justify-between rounded-lg hover:bg-accent transition-colors cursor-pointer", colors.textPrimary)}
            >
              <div className="flex items-center gap-2">
                {theme === 'dark' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                <span className="text-sm">{t('darkMode')}</span>
              </div>
              <Switch aria-label={t('darkMode')}
                checked={theme === 'dark'}
                onCheckedChange={handleThemeChange}
                onFocus={(e) => e.target.scrollIntoView({ block: 'nearest' })}
                onClick={(e) => e.stopPropagation()}
              />
            </div>

            {/* Blur Values Toggle */}
            <div
              onClick={(e) => {
                e.preventDefault();
                handleBlurValuesChange(!user?.blurValues);
              }}
              className={cn("px-3 py-2 mb-2 flex items-center justify-between rounded-lg hover:bg-accent transition-colors cursor-pointer", colors.textPrimary)}
            >
              <div className="flex items-center gap-2">
                {user?.blurValues ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                <span className="text-sm">{t('blurValues')}</span>
              </div>
              <Switch aria-label={t('blurValues')}
                checked={user?.blurValues || false}
                onCheckedChange={handleBlurValuesChange}
                onFocus={(e) => e.target.scrollIntoView({ block: 'nearest' })}
                onClick={(e) => e.stopPropagation()}
              />
            </div>

            {/* Calendar */}
            <button
              onClick={() => { setMobileMenuOpen(false); setCalendarOpen(true); }}
              className={cn("w-full flex items-center gap-2 px-3 py-2 mb-2 cursor-pointer rounded-lg hover:bg-accent transition-colors text-start", colors.textPrimary)}
            >
              <CalendarDays className="w-4 h-4" />
              <span className="text-sm">{t('calendar')}</span>
            </button>

            {/* Settings */}
            <Link
              to={createPageUrl('Settings')}
              onClick={() => setMobileMenuOpen(false)}
              className={cn("flex items-center gap-2 px-3 py-2 mb-2 cursor-pointer rounded-lg hover:bg-accent transition-colors", colors.textPrimary)}
            >
              <SettingsIcon className="w-4 h-4" />
              <span className="text-sm">{t('settings')}</span>
            </Link>

            {/* Logout */}
            <button
              onClick={handleLogout}
              className={cn(
                "w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors text-danger hover:text-danger/80"
              )}
            >
              <LogOut className="w-4 h-4" />
              {t('logout')}
            </button>
          </div>
        )}
      </div>



      {/* Main Content */}
      <main
        onClick={mobileMenuOpen ? () => setMobileMenuOpen(false) : undefined}
        className={cn(
          "min-h-dvh min-w-0 pt-16 md:pt-0 md:flex-1 transition-transform duration-300 [transition-timing-function:cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none",
          // On phones the menu sheet pushes the page aside instead of covering it
          mobileMenuOpen && (isRTL ? "translate-x-1/2" : "-translate-x-1/2")
        )}
      >
        <div className="pb-20 md:pb-0">
          {children}
        </div>
      </main>

      {calendarMounted && (
        <Suspense fallback={null}>
          <CalendarModal open={calendarOpen} onOpenChange={setCalendarOpen} />
        </Suspense>
      )}

      {/* Mobile Bottom Navigation */}
      <div className={cn(
        "md:hidden fixed bottom-0 start-0 end-0 border-t safe-area-inset-bottom z-50",
        "bg-card/85 backdrop-blur-md supports-[backdrop-filter]:bg-card/70",
        colors.border
      )}>
        <div className="flex items-center h-16">
          {/* Pages Navigation */}
          <nav className="flex items-center justify-around flex-1 px-2">
            {navigation.slice(0, 4).map((item) => {
              const isActive = currentPageName === item.page;
              const Icon = item.icon;
              return (
                <Link
                  key={item.page}
                  to={createPageUrl(item.page)}
                  className={cn(
                    "flex flex-col items-center justify-center flex-1 py-1.5 transition-colors",
                    isActive ? "text-primary" : "text-muted-foreground"
                  )}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <span className={cn(
                    "flex items-center justify-center w-14 h-8 rounded-full mb-0.5 transition-colors",
                    isActive ? "bg-primary/15" : "bg-transparent"
                  )}>
                    <Icon className="w-5 h-5" />
                  </span>
                  <span className="text-xs font-medium">{item.name}</span>
                </Link>
              );
            })}
          </nav>

          {/* Menu Button */}
          <div className={cn("border-s px-2", colors.border)}>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className={cn(
                "flex flex-col items-center justify-center h-full px-3 py-2 transition-colors",
                mobileMenuOpen ? "text-primary" : "text-muted-foreground"
              )}
            >
              {mobileMenuOpen ? (
                <X className="w-6 h-6 mb-1" />
              ) : (
                <Menu className="w-6 h-6 mb-1" />
              )}
              <span className="text-xs font-medium">{t('menu')}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Welcome Dialog for First Login */}
      <InstallHint />
      {WelcomeDialog && <WelcomeDialog
        open={showWelcomeDialog}
        onClose={() => setShowWelcomeDialog(false)}
      />}
    </div>
  );
}

export default function Layout({ children, currentPageName }) {
  return <LayoutContent children={children} currentPageName={currentPageName} />;
}