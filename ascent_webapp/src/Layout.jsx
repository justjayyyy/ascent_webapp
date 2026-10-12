import React, { useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCategories, usePlans } from '@/hooks/useWorkspaceData';
import { motion, useReducedMotion } from '@/lib/motion';
import { PieChart, Receipt, StickyNote, HandCoins, Milestone, TrendingDown, Landmark, ShoppingBasket, PiggyBank, BarChart3, ClipboardList, ArrowLeftRight } from 'lucide-react';
import AppSidebar from '@/components/AppSidebar';
import { cn } from '@/lib/utils';
import { useTheme } from './components/ThemeProvider';
import { useAuth } from '@/lib/AuthContext';
import { PAGE_LABELS, visibleSections } from '@/lib/navSections';
import { useSessionTimeout } from './hooks/useSessionTimeout';
import { useSignOut } from './hooks/useSignOut';
import { useWorkspaceSync } from './hooks/useWorkspaceSync';
import InvitationsBanner from '@/components/workspace/InvitationsBanner';
import { OwnerLeftPrompt, VerifyEmailBanner } from '@/components/account/AccountPrompts';
import WelcomeDialog from './components/WelcomeDialog';
import InstallHint from './components/InstallHint';
import MobileIsland from '@/components/MobileIsland';
import PullToRefresh from '@/components/shell/PullToRefresh';
import SyncStatus from '@/components/shell/SyncStatus';
import { QuickActionsProvider } from '@/components/shell/QuickActions';
import { AppLockProvider, useAppLock } from '@/components/security/AppLock';
import EnableBiometricPrompt from '@/components/security/EnableBiometricPrompt';
import AddTransactionDialog from '@/components/expenses/AddTransactionDialog';
import { useSaveTransaction } from '@/components/expenses/useTransactionMutations';
import { useOutbox } from '@/lib/offline/txOutbox';

// The calendar is heavy and only needed on demand
const CalendarModal = lazy(() => import('@/components/GoogleCalendar/CalendarModal'));

const SIDEBAR_KEY = 'ascent.sidebarCollapsed';

const PAGE_ICONS = {
  Dashboard: PieChart, Review: BarChart3, Expenses: Receipt, Income: HandCoins, Plans: Milestone,
  Commitments: Landmark, Savings: PiggyBank, Notes: StickyNote, Groceries: ShoppingBasket, Tasks: ClipboardList,
};
const SECTION_ICONS = { overview: PieChart, money: ArrowLeftRight, longTerm: Milestone };

// Which sidebar groups (a section shown as a submenu) are open, remembered on this device
const NAV_GROUPS_KEY = 'ascent.navGroupsOpen';
const readOpenGroups = () => {
  try { return JSON.parse(localStorage.getItem(NAV_GROUPS_KEY)) || {}; } catch { return {}; }
};
const withGroup = (prev, id, open) => {
  if (!!prev[id] === open) return prev;
  const next = { ...prev, [id]: open };
  try { localStorage.setItem(NAV_GROUPS_KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
  return next;
};

// Each tab keeps its own scroll position, like the tabs of a native app
const scrollMemory = new Map();

/** Add an expense or income from anywhere (the dock's + on pages without their own add). */
function QuickAddSheet({ request, onClose }) {
  const { save, saving } = useSaveTransaction();
  const enabled = !!request;
  const { data: categories = [] } = useCategories({ enabled });
  const { data: plans = [] } = usePlans({ enabled });
  return (
    <AddTransactionDialog
      key={request?.nonce}
      open={!!request}
      onClose={onClose}
      onSubmit={async (data) => { if (await save(data)) onClose(); }}
      isLoading={saving}
      categories={categories}
      plans={plans}
      defaultType={request?.type || 'Expense'}
    />
  );
}

function LayoutContent({ children, currentPageName }) {
  const { user, isRTL, t, saveUserPrefs, refreshUser } = useTheme();
  const { hasPermission } = useAuth();
  const { enabled: lockEnabled } = useAppLock();
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [quickAdd, setQuickAdd] = useState(null); // { type, nonce }
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

  const hideHeader = headerHidden && !mobileMenuOpen; // compact island
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

  // Idle sign-out, unless this device uses the Face ID lock (which locks instead of signing out)
  // ...and never while changes are still waiting to sync, which signing out would throw away
  const { pending: unsynced } = useOutbox();
  const unsyncedRef = useRef(unsynced);
  unsyncedRef.current = unsynced;
  const hasUnsynced = useCallback(() => unsyncedRef.current > 0, []);
  useSessionTimeout(!!user && !lockEnabled, t, hasUnsynced);
  useWorkspaceSync();

  // Check for first login welcome message
  useEffect(() => {
    if (user && sessionStorage.getItem('showWelcomeMessage') === 'true') {
      setShowWelcomeDialog(true);
      sessionStorage.removeItem('showWelcomeMessage');
    }
  }, [user]);

  // Signing out forgets this device's copy of the data, including changes that never synced: say so first
  const handleLogout = useSignOut();

  const handleThemeChange = useCallback(async (checked) => {
    const newTheme = checked ? 'dark' : 'light';
    if (user) {
      try {
        await saveUserPrefs({ theme: newTheme });
      } catch (error) {
        console.error('Failed to update theme');
        // Revert on error by refreshing from server
        await refreshUser();
      }
    }
  }, [user, saveUserPrefs, refreshUser]);

  const handleBlurValuesChange = useCallback(async (checked) => {
    if (user) {
      try {
        await saveUserPrefs({ blurValues: checked });
      } catch (error) {
        console.error('Failed to update blur values');
        // Revert on error by refreshing from server
        await refreshUser();
      }
    }
  }, [user, saveUserPrefs, refreshUser]);

  // One sidebar entry per section. A section of several pages links to its first, and its other pages
  // are tabs on the page (SectionTabs), a submenu in the sidebar, or open from inside the first.
  // A section left with one page a member may open goes by that page's name.
  const navigation = useMemo(() => visibleSections(hasPermission).map((section) => {
    const [first] = section.pages;
    const single = section.pages.length === 1;
    return {
      id: section.id,
      page: first,
      pages: section.pages,
      name: t(single ? PAGE_LABELS[first] : section.label),
      icon: (!single && SECTION_ICONS[section.id]) || PAGE_ICONS[first],
      children: section.layout === 'submenu' && !single
        ? section.pages.map((page) => ({ page, name: t(PAGE_LABELS[page]), icon: PAGE_ICONS[page] }))
        : null,
    };
  }), [t, hasPermission]);

  const [openGroups, setOpenGroups] = useState(readOpenGroups);
  const toggleGroup = useCallback((id) => setOpenGroups((prev) => withGroup(prev, id, !prev[id])), []);
  // Arriving on a page of a group opens it, so the page is there to see in the menu
  useEffect(() => {
    const group = navigation.find((item) => item.children && item.pages.includes(currentPageName));
    if (group) setOpenGroups((prev) => withGroup(prev, group.id, true));
  }, [currentPageName, navigation]);

  const pageTitle = PAGE_LABELS[currentPageName] ? t(PAGE_LABELS[currentPageName])
    : (currentPageName === 'Settings' ? t('settings') : 'Ascent');

  const canAddMoney = hasPermission('editExpenses');
  const canAddNotes = hasPermission('editNotes');
  const canAddGoals = hasPermission('editGoals');
  const openQuickAdd = useCallback((type) => setQuickAdd({ type, nonce: Date.now() }), []);
  const quickFallback = useCallback(() => {
    if (canAddMoney) openQuickAdd('Expense');
    else if (canAddNotes) navigate('/Notes?new=1');
  }, [canAddMoney, canAddNotes, openQuickAdd, navigate]);
  const quickMenu = useMemo(() => [
    canAddMoney && { id: 'expense', label: t('addExpense'), icon: TrendingDown, run: () => openQuickAdd('Expense') },
    canAddMoney && { id: 'income', label: t('addIncome'), icon: HandCoins, run: () => openQuickAdd('Income') },
    canAddMoney && { id: 'plan', label: t('newPlan'), icon: Milestone, run: () => navigate('/Plans?new=1') },
    canAddMoney && { id: 'commitment', label: t('cmNew'), icon: Landmark, run: () => navigate('/Commitments?new=1') },
    canAddGoals && { id: 'goal', label: t('svNewGoal'), icon: PiggyBank, run: () => navigate('/Savings?new=1') },
    canAddNotes && { id: 'note', label: t('ntNewNote'), icon: StickyNote, run: () => navigate('/Notes?new=1') },
    { id: 'task', label: t('tkNewTask'), icon: ClipboardList, run: () => navigate('/Tasks?new=1') },
  ].filter(Boolean), [canAddMoney, canAddNotes, canAddGoals, openQuickAdd, navigate, t]);

  // Tabs remember where they were scrolled to; a page seen for the first time starts at the top
  const lastPage = useRef(currentPageName);
  useLayoutEffect(() => {
    if (lastPage.current === currentPageName) return;
    scrollMemory.set(lastPage.current, window.scrollY);
    lastPage.current = currentPageName;
    const y = scrollMemory.get(currentPageName) || 0;
    window.scrollTo(0, 0);
    if (y) requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, y)));
  }, [currentPageName]);

  return (
    <QuickActionsProvider fallback={quickFallback} fallbackMenu={quickMenu}>
    <div className={cn(
      "min-h-dvh md:flex overflow-x-clip transition-colors bg-background text-foreground"
    )} dir={isRTL ? 'rtl' : 'ltr'}>
      <style>{`
        * { -webkit-tap-highlight-color: transparent; }
      `}</style>



      {/* Desktop Sidebar */}
      <AppSidebar
        navigation={navigation}
        openGroups={openGroups}
        onToggleGroup={toggleGroup}
        currentPageName={currentPageName}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={toggleSidebar}
        onOpenCalendar={() => setCalendarOpen(true)}
        calendarOpen={calendarOpen}
        onLogout={handleLogout}
        onThemeChange={handleThemeChange}
        onBlurChange={handleBlurValuesChange}
      />

      {/* Solid strip behind the status bar. It stays put while the header slides away under
          it, so page content never runs behind the clock and the system's soft edge fades
          into black. */}
      <div aria-hidden="true" className="md:hidden fixed top-0 start-0 end-0 z-[51] bg-background" style={{ height: 'var(--safe-top)' }} />

      {/* Mobile header: a morphing capsule ("island") below the status strip */}
      <MobileIsland
        compact={headerHidden}
        menuOpen={mobileMenuOpen}
        onMenu={() => setMobileMenuOpen((o) => !o)}
        onCalendar={() => { setMobileMenuOpen(false); setCalendarOpen(true); }}
        title={pageTitle}
        t={t}
      />

      {/* Mobile: the same sidebar, as a drawer that pushes the page */}
      <AppSidebar
        mobile
        open={mobileMenuOpen}
        onNavigate={() => setMobileMenuOpen(false)}
        navigation={navigation}
        openGroups={openGroups}
        onToggleGroup={toggleGroup}
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
        <div className="pb-[var(--dock-space)] safe-area-inset-x md:pb-0 md:px-0">
          <PullToRefresh disabled={mobileMenuOpen} label={t('refresh')}>
            <VerifyEmailBanner />
            <InvitationsBanner />
            <OwnerLeftPrompt />
            {/* A new page rises in; the previous one is already gone, so nothing slides over it */}
            <motion.div
              key={currentPageName}
              initial={reduceMotion ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            >
              {children}
            </motion.div>
          </PullToRefresh>
        </div>
      </main>

      <SyncStatus />
      <QuickAddSheet request={quickAdd} onClose={() => setQuickAdd(null)} />
      <EnableBiometricPrompt />

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
    </QuickActionsProvider>
  );
}

export default function Layout({ children, currentPageName }) {
  return (
    <AppLockProvider>
      <LayoutContent currentPageName={currentPageName}>{children}</LayoutContent>
    </AppLockProvider>
  );
}