import React, { useState, useEffect, useMemo, useCallback, lazy, Suspense } from 'react';
import { PieChart, Receipt, StickyNote } from 'lucide-react';
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
  const [headerHidden, setHeaderHidden] = useState(false);

  // Phones: the header bar slides away while scrolling down and returns on scroll up.
  // The strip behind the status bar stays, so page content never runs under the clock.
  useEffect(() => {
    let lastY = Math.max(0, window.scrollY);
    let ticking = false;
    const update = () => {
      ticking = false;
      const y = Math.max(0, window.scrollY);
      const dy = y - lastY;
      if (y <= 8) setHeaderHidden(false);
      else if (dy > 6 && y > 72) setHeaderHidden(true);
      else if (dy < -6) setHeaderHidden(false);
      if (Math.abs(dy) > 6 || y <= 8) lastY = y;
    };
    const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const hideHeader = headerHidden && !mobileMenuOpen;
  useEffect(() => {
    document.documentElement.toggleAttribute('data-header-hidden', hideHeader);
    return () => document.documentElement.removeAttribute('data-header-hidden');
  }, [hideHeader]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem(SIDEBAR_KEY) === '1'; } catch { return false; }
  });
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarMounted, setCalendarMounted] = useState(false);

  useEffect(() => { if (calendarOpen) setCalendarMounted(true); }, [calendarOpen]);

  // Phones: swipe in from the leading screen edge to open the menu, swipe back to close it
  useEffect(() => {
    let start = null;
    const onStart = (e) => {
      if (window.innerWidth >= 768 || e.touches.length !== 1) { start = null; return; }
      const x = e.touches[0].clientX;
      const fromEdge = isRTL ? window.innerWidth - x : x;
      start = { x, y: e.touches[0].clientY, fromEdge };
    };
    const onEnd = (e) => {
      if (!start) return;
      const t0 = e.changedTouches[0];
      const dx = (t0.clientX - start.x) * (isRTL ? -1 : 1); // positive = toward the page
      const dy = Math.abs(t0.clientY - start.y);
      if (dy < 40 && dx > 60 && start.fromEdge < 24) setMobileMenuOpen(true);
      else if (dy < 40 && dx < -60) setMobileMenuOpen(false);
      start = null;
    };
    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchend', onEnd, { passive: true });
    return () => { window.removeEventListener('touchstart', onStart); window.removeEventListener('touchend', onEnd); };
  }, [isRTL]);

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

      {/* Solid strip behind the status bar. It stays put while the header bar slides up
          underneath it, so the logo never shows through behind the clock. */}
      <div aria-hidden="true" className="md:hidden fixed top-0 start-0 end-0 z-[51] bg-background" style={{ height: 'var(--safe-top)' }} />

      {/* Mobile Header */}
      <div className={cn(
        "md:hidden fixed top-0 start-0 end-0 z-50 safe-area-inset-top safe-area-inset-x",
        "transition-transform duration-300 [transition-timing-function:cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none"
      )}
      // The strip behind the status bar is the page background, so the system's soft
      // edge under the clock/battery fades into black instead of showing as a grey blur
      style={{ background: 'linear-gradient(to bottom, hsl(var(--background)) var(--safe-top), hsl(var(--card)) var(--safe-top))', transform: hideHeader ? 'translateY(calc(var(--header-hide) * -1))' : undefined }}
      >
        <div className="relative flex items-center justify-center h-[var(--header-bar)] px-4">
          <button
            type="button"
            onClick={() => setMobileMenuOpen((o) => !o)}
            aria-label={t('menu')}
            aria-expanded={mobileMenuOpen}
            className={cn(
              "absolute start-1 top-1/2 -translate-y-1/2 grid h-12 w-12 place-items-center rounded-xl transition-colors active:bg-foreground/[0.1]",
              "hover:bg-foreground/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              mobileMenuOpen ? "text-primary" : "text-foreground"
            )}
          >
            <span className="relative block h-3.5 w-[18px]" aria-hidden="true">
              <span className={cn("absolute inset-x-0 h-0.5 rounded-full bg-current transition-all duration-300", mobileMenuOpen ? "top-1.5 rotate-45" : "top-0")} />
              <span className={cn("absolute inset-x-0 top-1.5 h-0.5 rounded-full bg-current transition-opacity duration-200", mobileMenuOpen && "opacity-0")} />
              <span className={cn("absolute inset-x-0 h-0.5 rounded-full bg-current transition-all duration-300", mobileMenuOpen ? "top-1.5 -rotate-45" : "top-3")} />
            </span>
          </button>
          {/* The logo sits on the header's bottom border, half over the bar and half over the page */}
          <div className="pointer-events-none absolute left-1/2 top-full -translate-x-1/2 -translate-y-1/2">
            <AscentLogo motion="full" alt="Ascent logo" className="w-[4.25rem]" />
          </div>
          {/* Hairline along the bottom edge: fades out at both ends and leaves a clear gap around the logo */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-px"
            style={{ background: 'linear-gradient(to right, transparent 0, hsl(var(--border)) 14%, hsl(var(--border)) calc(50% - 3.25rem), transparent calc(50% - 3.25rem), transparent calc(50% + 3.25rem), hsl(var(--border)) calc(50% + 3.25rem), hsl(var(--border)) 86%, transparent 100%)' }}
          />
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
          "min-h-dvh min-w-0 pt-[calc(var(--header-total)+var(--safe-top))] md:pt-0 md:flex-1 transition-transform duration-300 [transition-timing-function:cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none",
          // On phones the menu sheet pushes the page aside instead of covering it
          mobileMenuOpen && (isRTL ? "-translate-x-[17rem]" : "translate-x-[17rem]")
        )}
      >
        <div className="pb-[calc(1rem+env(safe-area-inset-bottom))] safe-area-inset-x md:pb-0 md:px-0">
          {children}
        </div>
      </main>

      {calendarMounted && (
        <Suspense fallback={null}>
          <CalendarModal open={calendarOpen} onOpenChange={setCalendarOpen} />
        </Suspense>
      )}

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