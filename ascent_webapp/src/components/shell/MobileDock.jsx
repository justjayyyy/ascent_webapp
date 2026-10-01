import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { createPageUrl } from '@/utils';
import { haptic } from '@/lib/haptics';
import { useQuickActions } from './QuickActions';

const SPRING = { type: 'spring', stiffness: 520, damping: 40, mass: 0.8 };
const LONG_PRESS_MS = 420;

/**
 * Phones: the floating dock. Four destinations around a + that adds to whatever page is on screen
 * (a long press opens a short menu of other things to add). It slims down while the page scrolls
 * down with the island above it, tucks away while the keyboard is up or a selection bar needs the
 * space, and tapping the tab you are already on scrolls back to the top.
 */
export default function MobileDock({ items, currentPageName, compact, canCreate, t }) {
  const reduce = useReducedMotion();
  const quick = useQuickActions();
  const [menu, setMenu] = useState(null); // items of the open long-press menu
  const pressTimer = useRef(null);
  const longPressed = useRef(false);
  const spring = reduce ? { duration: 0 } : SPRING;

  const left = items.slice(0, 2);
  const right = items.slice(2, 4);

  const closeMenu = useCallback(() => setMenu(null), []);

  useEffect(() => {
    if (!menu) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') closeMenu(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menu, closeMenu]);

  const openMenu = useCallback(() => {
    const list = quick?.menu() || [];
    if (!list.length) return;
    haptic('light');
    setMenu(list);
  }, [quick]);

  const startPress = () => {
    longPressed.current = false;
    clearTimeout(pressTimer.current);
    pressTimer.current = setTimeout(() => {
      longPressed.current = true;
      openMenu();
    }, LONG_PRESS_MS);
  };
  const cancelPress = () => clearTimeout(pressTimer.current);
  const onCreateClick = () => {
    cancelPress();
    if (longPressed.current) { longPressed.current = false; return; }
    haptic('light');
    quick?.create();
  };

  const tab = (item) => {
    const Icon = item.icon;
    const active = currentPageName === item.page;
    return (
      <li key={item.page} className="flex min-w-0 flex-1">
        <Link
          to={createPageUrl(item.page)}
          aria-label={item.name}
          aria-current={active ? 'page' : undefined}
          onClick={() => {
            haptic('selection');
            if (active) window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
          }}
          className={cn(
            'relative flex h-full w-full min-w-0 flex-col items-center justify-center gap-0.5 rounded-full outline-none',
            'transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-ring',
            active ? 'text-primary' : 'text-muted-foreground active:text-foreground',
          )}
        >
          {active && (
            <motion.span
              layoutId="dock-active"
              transition={spring}
              aria-hidden="true"
              className="absolute inset-x-1 inset-y-1.5 rounded-full bg-primary/[0.14] ring-1 ring-inset ring-primary/20"
            />
          )}
          <Icon className="relative h-[22px] w-[22px]" strokeWidth={active ? 2.3 : 1.9} aria-hidden="true" />
          <motion.span
            initial={false}
            animate={{ opacity: compact ? 0 : 1, height: compact ? 0 : 'auto' }}
            transition={spring}
            className="relative max-w-full overflow-hidden truncate px-1 text-xs font-medium leading-4"
          >
            {item.name}
          </motion.span>
        </Link>
      </li>
    );
  };

  return (
    <>
      <AnimatePresence>
        {menu && (
          <motion.div
            key="scrim"
            className="fixed inset-0 z-40 bg-background/50 backdrop-blur-[2px] md:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeMenu}
          />
        )}
      </AnimatePresence>

      <nav
        aria-label={t('mainNavigation')}
        className="mobile-dock pointer-events-none fixed inset-x-0 z-40 flex justify-center px-3 md:hidden"
        style={{ bottom: 'var(--dock-bottom)' }}
      >
        <div className="pointer-events-auto relative w-full max-w-[26rem]">
          {/* Long-press menu: things to add, rising from the + */}
          <AnimatePresence>
            {menu && (
              <motion.ul
                role="menu"
                aria-label={t('dockAddMenu')}
                className="absolute bottom-full left-1/2 mb-3 flex w-56 -translate-x-1/2 flex-col gap-1.5"
                initial="hidden"
                animate="show"
                exit="hidden"
                variants={{ show: { transition: { staggerChildren: 0.04, staggerDirection: -1 } }, hidden: {} }}
              >
                {menu.map((entry) => {
                  const Icon = entry.icon;
                  return (
                    <motion.li
                      key={entry.id}
                      variants={{
                        hidden: { opacity: 0, y: 14, scale: 0.94, filter: 'blur(4px)' },
                        show: { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)', transition: spring },
                      }}
                    >
                      <button
                        type="button"
                        role="menuitem"
                        autoFocus={entry === menu[0]}
                        onClick={() => { closeMenu(); haptic('light'); entry.run(); }}
                        className="flex h-12 w-full items-center gap-3 rounded-full border border-border/70 bg-popover/95 px-4 text-start text-sm font-medium text-foreground shadow-[0_12px_32px_-14px_hsl(0_0%_0%/0.7)] backdrop-blur-xl outline-none transition-colors active:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {Icon && <Icon className="h-[18px] w-[18px] shrink-0 text-primary" aria-hidden="true" />}
                        <span className="truncate">{entry.label}</span>
                      </button>
                    </motion.li>
                  );
                })}
              </motion.ul>
            )}
          </AnimatePresence>

          <motion.div
            initial={false}
            animate={{ height: compact ? 54 : 64 }}
            transition={spring}
            className={cn(
              'relative flex items-stretch rounded-full border border-border/70 bg-card/80 p-1 backdrop-blur-2xl backdrop-saturate-150',
              'shadow-[inset_0_1px_0_0_hsl(var(--foreground)/0.06),0_18px_40px_-18px_hsl(0_0%_0%/0.75),0_4px_14px_-8px_hsl(var(--glow)/0.35)]',
            )}
          >
            <ul className="flex flex-1 items-stretch">{left.map(tab)}</ul>

            {canCreate && (
              <div className="flex shrink-0 items-center px-1.5">
                <motion.button
                  type="button"
                  aria-label={t('dockAdd')}
                  aria-haspopup="menu"
                  aria-expanded={!!menu}
                  title={t('dockAddHint')}
                  whileTap={reduce ? undefined : { scale: 0.9 }}
                  onPointerDown={startPress}
                  onPointerUp={cancelPress}
                  onPointerLeave={cancelPress}
                  onPointerCancel={cancelPress}
                  onClick={onCreateClick}
                  onContextMenu={(e) => { e.preventDefault(); openMenu(); }}
                  className={cn(
                    'grid place-items-center rounded-full bg-primary text-primary-foreground outline-none',
                    'shadow-[0_8px_22px_-8px_hsl(var(--glow)/0.85),inset_0_1px_0_0_hsl(0_0%_100%/0.25)]',
                    'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card',
                    'h-12 w-12 select-none [-webkit-touch-callout:none]',
                  )}
                  // Slims with the dock by scaling, never by changing its layout size
                  initial={false}
                  animate={{ scale: compact ? 0.9 : 1 }}
                  transition={spring}
                >
                  <motion.span animate={{ rotate: menu ? 45 : 0 }} transition={spring} className="grid place-items-center">
                    <Plus className="h-6 w-6" strokeWidth={2.4} aria-hidden="true" />
                  </motion.span>
                </motion.button>
              </div>
            )}

            <ul className="flex flex-1 items-stretch">{right.map(tab)}</ul>
          </motion.div>
        </div>
      </nav>
    </>
  );
}
