import React from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { createPageUrl } from '@/utils';
import { useTheme } from '@/components/ThemeProvider';
import { useAuth } from '@/lib/AuthContext';
import { PAGE_LABELS, visibleSections } from '@/lib/navSections';

/**
 * The pages of a tabbed section (Expenses and Income) as a pill of tabs above the page title. The
 * sidebar has one entry for the section, so these are the way between them. Nothing shows when the
 * member may open only one of them.
 */
export default function SectionTabs({ page, className }) {
  const { t } = useTheme();
  const { hasPermission } = useAuth();
  const section = visibleSections(hasPermission).find((s) => s.pages.includes(page));
  if (section?.layout !== 'tabs' || section.pages.length < 2) return null;

  return (
    // A strip too wide for the phone scrolls on its own rather than widening the page
    <nav
      aria-label={t('navSectionPages')}
      className={cn('-mx-1 overflow-x-auto px-1 py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden', className)}
    >
      <ul className="inline-flex gap-1 rounded-full border border-border/60 bg-card/70 p-1 backdrop-blur-xl">
        {section.pages.map((p) => {
          const active = p === page;
          return (
            <li key={p}>
              <Link
                to={createPageUrl(p)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-11 items-center whitespace-nowrap rounded-full px-4 text-sm font-semibold transition-colors sm:h-9',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  active ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-foreground/10 hover:text-foreground',
                )}
              >
                {t(PAGE_LABELS[p])}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
