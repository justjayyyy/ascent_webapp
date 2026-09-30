import React, { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { useTheme } from '../ThemeProvider';

/** Scroll-spy: the section nearest the top third of the viewport is "active". */
export function useActiveSection(ids) {
  const [active, setActive] = useState(ids[0]);
  const key = ids.join('|');

  useEffect(() => {
    const els = ids.map((id) => document.getElementById(id)).filter(Boolean);
    if (!els.length || typeof IntersectionObserver === 'undefined') return undefined;
    const visible = new Set();
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => (e.isIntersecting ? visible.add(e.target.id) : visible.delete(e.target.id)));
        const first = ids.find((id) => visible.has(id));
        const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
        if (atBottom) setActive(ids[ids.length - 1]);
        else if (first) setActive(first);
      },
      { rootMargin: '-15% 0px -60% 0px' }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return [active, setActive];
}

/** variant 'strip' = sticky chips for phones (render as a direct child of the tall page container); 'rail' = desktop side list. */
export default function SettingsNav({ items, active, onSelect, variant = 'rail' }) {
  const { t } = useTheme();
  const railRef = useRef(null);

  // Keep the active chip visible in the phone strip. This scrolls only the strip itself: calling
  // scrollIntoView here would also drive the page scroller and, in WebKit, cancel the smooth
  // scroll to the section that the same tap just started.
  useEffect(() => {
    const nav = railRef.current;
    const el = nav?.querySelector('[aria-current="true"]');
    if (!nav || !el) return;
    const n = nav.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const delta = r.left + r.width / 2 - (n.left + n.width / 2);
    if (Math.abs(delta) > 1) nav.scrollBy({ left: delta, behavior: 'smooth' });
  }, [active]);

  const go = (e, id) => {
    e.preventDefault();
    onSelect(id);
    const el = document.getElementById(id);
    if (!el) return;
    // Land the section just below the sticky strip (phones) or the top gap (desktop rail)
    const strip = variant === 'strip' ? railRef.current : null;
    const offset = strip ? (parseFloat(getComputedStyle(strip).top) || 0) + strip.offsetHeight + 12 : 32;
    const top = Math.max(0, el.getBoundingClientRect().top + window.scrollY - offset);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top, behavior: reduce ? 'auto' : 'smooth' });
    history.replaceState(null, '', `#${id}`);
  };

  if (variant === 'strip') {
    return (
      <nav
        aria-label={t('setSections')}
        ref={railRef}
        className="sticky top-[var(--sticky-top)] z-30 transition-[top] duration-300 -mx-4 mb-6 flex gap-1.5 overflow-x-auto border-b border-border/60 bg-background/90 px-4 py-2 backdrop-blur-md md:top-0 md:-mx-8 md:px-8 lg:hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map(({ id, label }) => (
          <a
            key={id}
            href={`#${id}`}
            onClick={(e) => go(e, id)}
            aria-current={active === id ? 'true' : undefined}
            className={cn(
              'inline-flex h-11 shrink-0 items-center rounded-full px-4 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
              active === id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'
            )}
          >
            {label}
          </a>
        ))}
      </nav>
    );
  }

  return (
    <nav aria-label={t('setSections')} className="hidden lg:block">
      <ul className="sticky top-8 flex flex-col gap-0.5">
        {items.map(({ id, label, icon: Icon }) => (
          <li key={id}>
            <a
              href={`#${id}`}
              onClick={(e) => go(e, id)}
              aria-current={active === id ? 'true' : undefined}
              className={cn(
                'flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
                active === id ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground'
              )}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              {label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
