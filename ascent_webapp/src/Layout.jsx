import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from './utils';
import { Home, PieChart, Receipt, Settings as SettingsIcon, LogOut, Menu, X, ChevronLeft, ChevronRight, StickyNote, Calendar, ChevronUp, Moon, Sun, Eye, EyeOff } from 'lucide-react';
import { SidebarCalendarButton, HeaderCalendarButton, FloatingCalendarButton } from '@/components/GoogleCalendar/CalendarButton';
import { ascent } from '@/api/client';
import { cn } from '@/lib/utils';
import { ThemeProvider, useTheme } from './components/ThemeProvider';
import { useAuth } from '@/lib/AuthContext';
import { useSessionTimeout } from './hooks/useSessionTimeout';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Switch } from '@/components/ui/switch';
import WelcomeDialog from './components/WelcomeDialog';
import InstallHint from './components/InstallHint';

function LayoutContent({ children, currentPageName }) {
  const { user, theme, language, isRTL, colors, t, updateUserLocal, refreshUser } = useTheme();
  const { permissions, hasPermission, workspaces, currentWorkspace, switchWorkspace } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
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
      "min-h-dvh transition-colors bg-background text-foreground"
    )} dir={isRTL ? 'rtl' : 'ltr'}>
      <style>{`
        * { -webkit-tap-highlight-color: transparent; }
      `}</style>



      {/* Desktop Sidebar */}
      <aside className={cn(
        "hidden md:fixed md:inset-y-0 md:flex md:flex-col transition-all duration-300",
        sidebarCollapsed ? "md:w-20" : "md:w-64",
        "start-0"
      )}>
        <div className={cn(
          "flex flex-col flex-grow overflow-y-auto relative",
          colors.bgSecondary,
          colors.border,
          isRTL ? 'border-l' : 'border-r'
        )}>
          <div className={cn("flex items-center justify-center h-20 px-4 py-4 border-b", colors.border)}>
            {sidebarCollapsed ? (
              <button
                onClick={() => setSidebarCollapsed(false)}
                aria-label={t('toggleSidebar')}
                className="p-1.5 rounded-full bg-primary hover:bg-primary/85 transition-all"
              >
                {isRTL ? <ChevronLeft className="w-4 h-4 text-foreground" /> : <ChevronRight className="w-4 h-4 text-foreground" />}
              </button>
            ) : (
              <DropdownMenu open={workspaceMenuOpen} onOpenChange={setWorkspaceMenuOpen}>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-accent transition-colors w-full">
                    <img
                      src={theme === 'dark' ? "/logo-dark.png" : "/logo-light.png"}
                      alt="Ascent logo"
                      className="w-12 h-12 object-contain"
                      style={{ filter: 'brightness(1.1) saturate(1.2)' }}
                    />
                    <div className="flex-1 text-start min-w-0">
                      <p className={cn("text-sm font-bold truncate", colors.textPrimary)}>
                        {currentWorkspace?.name || 'Ascent'}
                      </p>
                      <p className={cn("text-xs truncate", colors.textTertiary)}>
                        {workspaces.length > 1 ? t('switchWorkspace') : t('workspace')}
                      </p>
                    </div>
                    {workspaces.length > 1 && <ChevronUp className={cn("w-4 h-4", colors.textTertiary)} />}
                  </button>
                </DropdownMenuTrigger>
                {workspaces.length > 1 && (
                  <DropdownMenuContent className={cn("w-56", colors.cardBg, colors.cardBorder)}>
                    {workspaces.map(ws => (
                      <DropdownMenuItem
                        key={ws.id || ws._id}
                        onClick={() => switchWorkspace(ws.id || ws._id)}
                        className={cn(
                          "cursor-pointer",
                          (currentWorkspace?.id === ws.id || currentWorkspace?._id === ws._id) && "bg-accent"
                        )}
                      >
                        <span className={cn(colors.textPrimary)}>{ws.name}</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                )}
              </DropdownMenu>
            )}
          </div>

          {/* Collapse Button on Edge */}
          {!sidebarCollapsed && (
            <button
              onClick={() => setSidebarCollapsed(true)}
              aria-label={t('toggleSidebar')}
              className={cn(
                "fixed top-6 p-1.5 rounded-full bg-primary hover:bg-primary/85 transition-all shadow-lg z-[9999]",
                isRTL ? (sidebarCollapsed ? "right-[4.5rem]" : "right-64 -translate-x-1/2") : (sidebarCollapsed ? "left-[4.5rem]" : "left-64 -translate-x-1/2")
              )}
            >
              {isRTL ? <ChevronRight className="w-4 h-4 text-foreground" /> : <ChevronLeft className="w-4 h-4 text-foreground" />}
            </button>
          )}

          <nav className="flex-1 px-3 py-4 space-y-1">
            {navigation.map((item) => {
              const isActive = currentPageName === item.page;
              const Icon = item.icon;
              if (!Icon) return null;
              return (
                <Link
                  key={item.page}
                  to={createPageUrl(item.page)}
                  className={cn(
                    "flex items-center px-4 py-2.5 text-sm font-medium rounded-xl transition-all duration-200",
                    isActive
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : cn(colors.textSecondary, "hover:bg-accent hover:text-foreground"),
                    sidebarCollapsed && "justify-center"
                  )}
                  title={sidebarCollapsed ? item.name : undefined}
                >
                  <Icon className={cn("w-5 h-5", !sidebarCollapsed && ("me-3"))} />
                  {!sidebarCollapsed && item.name}
                </Link>
              );
            })}

            {/* OPTION 1: Calendar in Sidebar - ENABLED */}
            <div className="pt-2 border-t border-border mt-2">
              {SidebarCalendarButton && <SidebarCalendarButton className={sidebarCollapsed ? "justify-center" : ""} />}
            </div>
          </nav>

          {user && (
            <div className={cn("border-t p-px", colors.border)}>
              {!sidebarCollapsed ? (
                <DropdownMenu open={userMenuOpen} onOpenChange={setUserMenuOpen}>
                  <DropdownMenuTrigger asChild>
                    <button className="w-full flex items-center justify-between px-5 py-2 rounded-xl hover:bg-accent transition-colors cursor-pointer">
                      <div className="flex items-center min-w-0">
                        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-semibold">
                          {user.full_name?.[0] || user.email[0].toUpperCase()}
                        </div>
                        <div className={cn("flex-1 min-w-0", "ms-3")}>
                          <p className={cn("text-sm font-medium truncate", colors.textPrimary)}>
                            {user.full_name || t('user')}
                          </p>
                          <p className={cn("text-xs truncate", colors.textTertiary)}>{user.email}</p>
                        </div>
                      </div>
                      <ChevronUp className={cn("w-4 h-4 flex-shrink-0", colors.textTertiary)} />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    side="top"
                    align="center"
                    sideOffset={8}
                    className={cn("w-[240px] max-w-[calc(100vw-2rem)] mb-0 rounded-xl", colors.cardBg, colors.cardBorder)}
                    style={{ maxHeight: 'calc(100vh - 200px)' }}
                  >
                    {/* User Info */}
                    <div className="p-1.5 text-center">
                      <p className={cn("text-sm font-semibold", colors.textPrimary)}>{user.full_name || t('user')}</p>
                      <p className={cn("text-xs mt-0.5", colors.textTertiary)}>
                        {permissions ? t('sharedUser') : t('owner')}
                      </p>
                    </div>

                    {/* Custom Separator - 93% width */}
                    <div className="flex justify-center py-1">
                      <div className={cn("w-[93%] h-px opacity-30", 'bg-border')} />
                    </div>

                    {/* Theme Toggle */}
                    <div
                      onClick={(e) => {
                        e.preventDefault();
                        handleThemeChange(theme !== 'dark');
                      }}
                      className={cn("px-3 py-[5px] flex items-center justify-between rounded-lg hover:bg-accent transition-colors cursor-pointer", colors.textPrimary)}
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
                      className={cn("px-3 py-[5px] flex items-center justify-between rounded-lg hover:bg-accent transition-colors cursor-pointer", colors.textPrimary)}
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

                    {/* Custom Separator - 93% width */}
                    <div className="flex justify-center py-1">
                      <div className={cn("w-[93%] h-px opacity-30", 'bg-border')} />
                    </div>

                    {/* Settings */}
                    <>
                      <DropdownMenuItem asChild>
                        <Link
                          to={createPageUrl('Settings')}
                          className={cn("flex items-center gap-2 px-3 py-[5px] cursor-pointer rounded-lg hover:bg-accent transition-colors", colors.textPrimary)}
                          onClick={() => setUserMenuOpen(false)}
                        >
                          <SettingsIcon className="w-4 h-4" />
                          <span className="text-sm">{t('settings')}</span>
                        </Link>
                      </DropdownMenuItem>

                      {/* Custom Separator - 93% width */}
                      <div className="flex justify-center py-1">
                        <div className={cn("w-[93%] h-px opacity-30", 'bg-border')} />
                      </div>
                    </>

                    {/* Logout */}
                    <DropdownMenuItem
                      onClick={handleLogout}
                      className={cn("flex items-center justify-center gap-2 px-3 py-[5px] cursor-pointer text-danger hover:text-danger/80 focus:text-danger rounded-lg transition-colors")}
                    >
                      <LogOut className="w-4 h-4" />
                      <span className="text-sm">{t('logout')}</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <div className="flex flex-col items-center space-y-3">
                  <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-semibold">
                    {user.full_name?.[0] || user.email[0].toUpperCase()}
                  </div>
                  <button
                    onClick={handleLogout}
                    className={cn(
                      "p-2 rounded-lg transition-colors",
                      colors.textSecondary,
                      "hover:bg-accent"
                    )}
                    title={t('logout')}
                  >
                    <LogOut className="w-5 h-5" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </aside>

      {/* Mobile Header */}
      <div className={cn(
        "md:hidden fixed top-0 start-0 end-0 z-50 border-b safe-area-inset-top",
        "bg-card/85 backdrop-blur-md supports-[backdrop-filter]:bg-card/70",
        colors.border
      )}>
        <div className="flex items-center justify-center h-16 px-4">
          <img
            src={theme === 'dark'
              ? "/logo-dark.png"
              : "/logo-light.png"
            }
            alt="Ascent logo"
            className="w-16 h-16 object-contain"
            style={{ filter: 'brightness(1.1) saturate(1.2)' }}
          />
        </div>
      </div>

      {/* Mobile Menu Backdrop */}
      {mobileMenuOpen && (
        <div
          onClick={() => setMobileMenuOpen(false)}
          className={cn(
            "md:hidden fixed inset-0 z-40 bg-black/50 transition-opacity duration-300",
            mobileMenuOpen ? "opacity-100" : "opacity-0"
          )}
          style={{ top: 'calc(4rem + env(safe-area-inset-top))', bottom: 'calc(4rem + env(safe-area-inset-bottom))' }}
        />
      )}

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
      <main className={cn(
        "min-h-dvh pt-16 md:pt-0 transition-all duration-300",
        isRTL
          ? (sidebarCollapsed ? "md:pe-20" : "md:pe-64")
          : (sidebarCollapsed ? "md:ps-20" : "md:ps-64")
      )}>
        <div className="pb-20 md:pb-0">
          {children}
        </div>
      </main>

      {/* OPTION 2: Floating Calendar Button - DISABLED */}
      {/* <FloatingCalendarButton /> */}

      {/* OPTION 3: Header Calendar Button - DISABLED */}
      {/* <div className={cn(
        "fixed top-4 z-50",
        isRTL 
          ? (sidebarCollapsed ? "end-24" : "right-[17rem]")
          : (sidebarCollapsed ? "start-24" : "left-[17rem]"),
        "hidden md:block"
      )}>
        <HeaderCalendarButton />
      </div> */}

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