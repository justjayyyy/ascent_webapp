import React, { useLayoutEffect, useRef, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  ChevronsUpDown, ChevronLeft, Check, Moon, Sun, Eye, EyeOff,
  Settings as SettingsIcon, LogOut, CalendarDays,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { createPageUrl } from '@/utils';
import { useTheme } from '@/components/ThemeProvider';
import { useAuth } from '@/lib/AuthContext';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import AscentLogo from '@/components/AscentLogo';

const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--sidebar-background))]';

/** Wraps children in a tooltip only when the rail is collapsed. */
function RailTip({ label, show, side, children }) {
  if (!show) return children;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side} sideOffset={12} className="bg-popover text-popover-foreground border border-border/60 shadow-lg">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

function Label({ collapsed, children, className }) {
  return (
    <span
      className={cn(
        'min-w-0 truncate transition-[opacity,transform] duration-200',
        collapsed ? 'pointer-events-none opacity-0 -translate-x-1 rtl:translate-x-1' : 'opacity-100 delay-100',
        className,
      )}
    >
      {children}
    </span>
  );
}

function Avatar({ user, className }) {
  return (
    <span
      className={cn(
        'grid shrink-0 place-items-center rounded-full bg-primary font-semibold text-primary-foreground',
        'shadow-[0_4px_14px_-4px_hsl(var(--glow)/0.6)] ring-2 ring-[hsl(var(--sidebar-background))]',
        className,
      )}
      aria-hidden="true"
    >
      {(user?.full_name?.[0] || user?.email?.[0] || '?').toUpperCase()}
    </span>
  );
}

export default function AppSidebar({
  navigation,
  currentPageName,
  collapsed: collapsedProp,
  onToggleCollapsed,
  mobile = false,
  open = false,
  onNavigate,
  onOpenCalendar,
  calendarOpen,
  onLogout,
  onThemeChange,
  onBlurChange,
}) {
  const { user, theme, isRTL, t } = useTheme();
  const { permissions, workspaces, currentWorkspace, switchWorkspace } = useAuth();
  const collapsed = mobile ? false : collapsedProp;
  const tipSide = isRTL ? 'left' : 'right';

  // Sliding active indicator: measure the active item and glide a highlight to it.
  const navRef = useRef(null);
  const itemRefs = useRef({});
  const [indicator, setIndicator] = useState(null);
  const placedOnce = useRef(false);
  const activeKey = calendarOpen ? '__calendar' : currentPageName;

  useLayoutEffect(() => {
    const measure = () => {
      const el = itemRefs.current[activeKey];
      if (!el) return setIndicator(null);
      setIndicator({ top: el.offsetTop, height: el.offsetHeight });
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (navRef.current) ro.observe(navRef.current);
    return () => ro.disconnect();
  }, [activeKey, navigation.length, collapsed]);

  useEffect(() => {
    if (indicator) placedOnce.current = true;
  }, [indicator]);

  const today = new Date().getDate();
  const workspaceName = currentWorkspace?.name || 'Ascent';
  const canSwitch = workspaces.length > 1;
  const isOwnerLabel = permissions ? t('sharedUser') : t('owner');

  const itemBase = cn(
    'group relative z-10 flex h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium',
    'transition-colors duration-200', focusRing,
  );

  const setItemRef = (key) => (el) => { itemRefs.current[key] = el; };

  const ThemeIcon = theme === 'dark' ? Sun : Moon;
  const BlurIcon = user?.blurValues ? Eye : EyeOff;

  const quickButton = (label, onClick, Icon, pressed) => (
    <RailTip label={label} show={collapsed} side={tipSide} key={label}>
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        aria-pressed={pressed}
        className={cn(
          'grid h-9 place-items-center rounded-lg text-muted-foreground transition-colors',
          'hover:bg-foreground/[0.07] hover:text-foreground', focusRing,
          collapsed ? 'w-9' : 'flex-1',
          pressed && 'text-primary',
        )}
      >
        <Icon className="h-[18px] w-[18px]" />
      </button>
    </RailTip>
  );

  return (
    <TooltipProvider delayDuration={100}>
      <div
        className={cn(
          'group/sb z-30',
          mobile
            ? cn(
                'fixed start-0 z-40 w-[17rem] md:hidden top-[calc(4rem+env(safe-area-inset-top))] bottom-[calc(4rem+env(safe-area-inset-bottom))]',
                'transition-transform duration-300 [transition-timing-function:cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none',
                open ? 'translate-x-0' : (isRTL ? 'translate-x-full' : '-translate-x-full'),
              )
            : cn(
                'relative hidden shrink-0 md:sticky md:top-0 md:block md:h-dvh',
                'transition-[width] duration-300 [transition-timing-function:cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none',
                collapsed ? 'md:w-20' : 'md:w-[17rem]',
              ),
        )}
        inert={mobile && !open ? '' : undefined}
      >
      <aside
        aria-label={t('mainNavigation')}
        className="relative flex h-full flex-col overflow-hidden border-e border-[hsl(var(--sidebar-border))] bg-[hsl(var(--sidebar-background))]"
      >
        {/* Ambient accent wash */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-56 opacity-70"
          style={{ background: 'radial-gradient(120% 100% at 0% 0%, hsl(var(--glow) / 0.16), transparent 70%)' }}
        />

        {/* Brand + workspace */}
        <div className="relative flex h-[4.5rem] shrink-0 items-center gap-1 px-3">
          <DropdownMenu>
            <RailTip label={workspaceName} show={collapsed} side={tipSide}>
              <DropdownMenuTrigger asChild disabled={!canSwitch}>
                <button
                  type="button"
                  className={cn(
                    'flex min-w-0 flex-1 items-center gap-3 rounded-xl p-1.5 text-start transition-colors', mobile && 'ps-3',
                    canSwitch ? 'hover:bg-foreground/[0.06]' : 'cursor-default', focusRing,
                    collapsed && 'flex-none',
                  )}
                  aria-label={canSwitch ? t('switchWorkspace') : undefined}
                >
                  {!mobile && <AscentLogo motion="full" className="w-10 shrink-0" />}
                  <span className={cn('min-w-0 flex-1 transition-opacity duration-200', collapsed ? 'pointer-events-none w-0 opacity-0' : 'opacity-100 delay-100')}>
                    <span className="block truncate text-sm font-semibold leading-tight text-foreground">{workspaceName}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {canSwitch ? t('switchWorkspace') : t('workspace')}
                    </span>
                  </span>
                  {canSwitch && !collapsed && <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />}
                </button>
              </DropdownMenuTrigger>
            </RailTip>
            {canSwitch && (
              <DropdownMenuContent align="start" sideOffset={6} className="w-60 rounded-2xl bg-popover p-1.5">
                {workspaces.map((ws) => {
                  const id = ws.id || ws._id;
                  const active = currentWorkspace?.id === id || currentWorkspace?._id === id;
                  return (
                    <DropdownMenuItem key={id} onClick={() => switchWorkspace(id)} className="cursor-pointer gap-2 rounded-lg px-3 py-2">
                      <span className="flex-1 truncate">{ws.name}</span>
                      {active && <Check className="h-4 w-4 text-primary" />}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            )}
          </DropdownMenu>

        </div>

        {/* Navigation */}
        <nav ref={navRef} className="relative flex-1 overflow-y-auto overflow-x-hidden px-3 py-2" aria-label={t('mainNavigation')}>
          {/* gliding highlight */}
          <span
            aria-hidden="true"
            className={cn(
              'pointer-events-none absolute inset-x-3 top-0 z-0 rounded-xl',
              'bg-primary/[0.13] ring-1 ring-inset ring-primary/25',
              'shadow-[0_8px_24px_-12px_hsl(var(--glow)/0.7)]',
              'motion-reduce:transition-none',
              placedOnce.current ? 'transition-[transform,height,opacity] duration-300 [transition-timing-function:cubic-bezier(0.32,0.72,0,1)]' : '',
            )}
            style={{
              height: indicator?.height ?? 0,
              transform: `translateY(${indicator?.top ?? 0}px)`,
              opacity: indicator ? 1 : 0,
            }}
          >
            <span className="absolute inset-y-2.5 start-0 w-[3px] rounded-e-full bg-primary shadow-[0_0_10px_hsl(var(--glow)/0.9)]" />
          </span>

          <ul className="space-y-1">
            {navigation.map((item) => {
              const Icon = item.icon;
              if (!Icon) return null;
              const isActive = currentPageName === item.page && !calendarOpen;
              return (
                <li key={item.page}>
                  <RailTip label={item.name} show={collapsed} side={tipSide}>
                    <Link
                      ref={setItemRef(item.page)}
                      to={createPageUrl(item.page)}
                      aria-current={isActive ? 'page' : undefined}
                      onClick={onNavigate}
                      className={cn(itemBase, isActive ? 'text-foreground' : 'text-foreground/70 hover:bg-foreground/[0.05] hover:text-foreground')}
                    >
                      <Icon className={cn('h-5 w-5 shrink-0 transition-colors duration-200', isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground')} />
                      <Label collapsed={collapsed}>{item.name}</Label>
                    </Link>
                  </RailTip>
                </li>
              );
            })}
          </ul>

          <div className="my-3 h-px bg-[hsl(var(--sidebar-border))]" role="separator" />

          <ul>
            <li>
              <RailTip label={t('calendar')} show={collapsed} side={tipSide}>
                <button
                  type="button"
                  ref={setItemRef('__calendar')}
                  onClick={() => { onNavigate?.(); onOpenCalendar(); }}
                  aria-haspopup="dialog"
                  className={cn(itemBase, calendarOpen ? 'text-foreground' : 'text-foreground/70 hover:bg-foreground/[0.05] hover:text-foreground')}
                >
                  {/* Calendar glyph that shows today's date */}
                  <span className="relative grid h-5 w-5 shrink-0 place-items-center" aria-hidden="true">
                    <CalendarDays className={cn('absolute inset-0 h-5 w-5 transition-colors duration-200', calendarOpen ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground')} />
                  </span>
                  <Label collapsed={collapsed} className="flex-1 text-start">{t('calendar')}</Label>
                  {!collapsed && (
                    <span className="tabular grid h-6 min-w-6 place-items-center rounded-md bg-primary/15 px-1.5 text-xs font-semibold text-primary">
                      {today}
                    </span>
                  )}
                </button>
              </RailTip>
            </li>
          </ul>
        </nav>

        {/* Footer */}
        <div className="relative shrink-0 space-y-2 border-t border-[hsl(var(--sidebar-border))] p-3">
          <div className={cn('flex items-center gap-1 rounded-xl bg-foreground/[0.04] p-1', collapsed && 'flex-col bg-transparent p-0')}>
            {quickButton(t('darkMode'), () => onThemeChange(theme !== 'dark'), ThemeIcon, theme === 'dark')}
            {quickButton(t('blurValues'), () => onBlurChange(!user?.blurValues), BlurIcon, !!user?.blurValues)}
          </div>

          {user && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    'flex w-full items-center gap-3 rounded-xl p-2 text-start transition-colors hover:bg-foreground/[0.06]',
                    focusRing, collapsed && 'justify-center',
                  )}
                >
                  <Avatar user={user} className="h-9 w-9 text-sm" />
                  {!collapsed && (
                    <>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium leading-tight text-foreground">{user.full_name || t('user')}</span>
                        <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
                      </span>
                      <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side={collapsed ? tipSide : 'top'}
                align={collapsed ? 'end' : 'center'}
                sideOffset={10}
                className="w-64 max-w-[calc(100vw-2rem)] rounded-2xl bg-popover p-1.5"
              >
                <div className="flex items-center gap-3 px-2.5 py-2">
                  <Avatar user={user} className="h-10 w-10" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{user.full_name || t('user')}</p>
                    <p className="truncate text-xs text-muted-foreground">{isOwnerLabel}</p>
                  </div>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to={createPageUrl('Settings')} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2">
                    <SettingsIcon className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{t('settings')}</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={onLogout}
                  className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-danger focus:text-danger"
                >
                  <LogOut className="h-4 w-4" />
                  <span className="text-sm">{t('logout')}</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </aside>

      {!mobile && (
      <>
      {/* Edge handle: a hairline you can grab anywhere along the border, plus a round chevron knob */}
      <button
        type="button"
        onClick={onToggleCollapsed}
        aria-label={collapsed ? t('expandSidebar') : t('collapseSidebar')}
        aria-expanded={!collapsed}
        title={`${collapsed ? t('expandSidebar') : t('collapseSidebar')}  Ctrl+B`}
        className={cn(
          'group/edge absolute inset-y-0 -end-2 z-40 flex w-4 items-start justify-center',
          'cursor-pointer',
          focusRing,
        )}
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 start-1/2 w-px -translate-x-1/2 bg-primary/0 transition-colors duration-200 group-hover/edge:bg-primary/60 group-focus-visible/edge:bg-primary/60"
        />
        <span
          aria-hidden="true"
          className={cn(
            'relative mt-[1.6rem] grid h-6 w-6 shrink-0 place-items-center rounded-full border border-border bg-popover text-muted-foreground',
            'shadow-[0_4px_14px_-4px_hsl(0_0%_0%/0.5)] transition-all duration-200',
            'opacity-0 scale-90 group-hover/sb:opacity-100 group-hover/sb:scale-100 group-focus-within/sb:opacity-100 group-focus-within/sb:scale-100',
            'group-hover/edge:border-primary/60 group-hover/edge:text-primary group-hover/edge:scale-110',
          )}
        >
          <ChevronLeft
            className={cn('h-3.5 w-3.5 transition-transform duration-300', (collapsed !== isRTL) && 'rotate-180')}
          />
        </span>
      </button>
      </>
      )}
      </div>
    </TooltipProvider>
  );
}
