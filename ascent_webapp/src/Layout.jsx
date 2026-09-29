import React, { useState, useEffect, useMemo, useCallback, lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from './utils';
import { PieChart, Receipt, Menu, X, StickyNote } from 'lucide-react';
import AppSidebar from '@/components/AppSidebar';
import { ascent } from '@/api/client';
import { cn } from '@/lib/utils';
import { useTheme } from './components/ThemeProvider';
import { useAuth } from '@/lib/AuthContext';
import { useSessionTimeout } from './hooks/useSessionTimeout';
import WelcomeDialog from './components/WelcomeDialog';
import InstallHint from './components/InstallHint';
import AscentLogo from '@/components/AscentLogo';

// The calendar is heavy and only needed on demand
const CalendarModal = lazy(() => import('@/components/GoogleCalendar/CalendarModal'));

const SIDEBAR_KEY = 'ascent.sidebarCollapsed';

function LayoutContent({ children, currentPageName }) {
  const { user, isRTL, colors, t, updateUserLocal, refreshUser } = useTheme();
  const { hasPermission } = useAuth();
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
    // Open to every member: notes shared with someone need no workspace-wide notes permission
    { name: t('notes'), page: 'Notes', icon: StickyNote },
    // { name: t('settings'), page: 'Settings', icon: SettingsIcon, permission: 'viewSettings' },
  ].filter(item => !item.permission || hasPermission(item.permission)), [t, hasPermission]);

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
          <AscentLogo motion="full" alt="Ascent logo" className="w-14" />
        </div>
      </div>

      {/* Mobile: the same sidebar, as a drawer that pushes the page */}
      <AppSidebar
        mobile
        open={mobileMenuOpen}
        onNavigate={() => setMobileMenuOpen(false)}
        navigation={navigation}
        currentPageName={currentPageName}
        onOpenCalendar={() => setCalendarOpen(true)}
        calendarOpen={calendarOpen}
        onLogout={handleLogout}
        onThemeChange={handleThemeChange}
        onBlurChange={handleBlurValuesChange}
      />

      {/* Main Content */}
      <main
        onClick={mobileMenuOpen ? () => setMobileMenuOpen(false) : undefined}
        className={cn(
          "min-h-dvh min-w-0 pt-[calc(4rem+env(safe-area-inset-top))] md:pt-0 md:flex-1 transition-transform duration-300 [transition-timing-function:cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none",
          // On phones the menu sheet pushes the page aside instead of covering it
          mobileMenuOpen && (isRTL ? "-translate-x-[17rem]" : "translate-x-[17rem]")
        )}
      >
        <div className="pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0">
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
          <div className={cn("border-s px-2 rtl:order-first rtl:border-s-0 rtl:border-e", colors.border)}>
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