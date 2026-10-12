import { PAGE_PERMISSIONS } from './pageAccess';

// One sidebar entry per section. How a section of several pages shows them (`layout`):
//   'tabs'     a pill of tabs at the top of each of its pages (SectionTabs)
//   'submenu'  a group in the sidebar that opens to list them
//   (none)     the entry leads to the first page, and the others open from inside it
// `label` is the section's translation key in the sidebar when it holds more than one page.
export const NAV_SECTIONS = [
  // The monthly review opens from its card on the Dashboard
  { id: 'overview', label: 'dashboard', pages: ['Dashboard', 'Review'] },
  { id: 'money', label: 'transactions', layout: 'tabs', pages: ['Expenses', 'Income'] },
  { id: 'longTerm', label: 'navLongTerm', layout: 'submenu', pages: ['Plans', 'Commitments', 'Savings'] },
  { id: 'notes', label: 'notes', pages: ['Notes'] },
  { id: 'groceries', label: 'grTitle', pages: ['Groceries'] },
  { id: 'tasks', label: 'tkNav', pages: ['Tasks'] },
];

// Each page's name, as a translation key: its tab, and the page title in the phone header
export const PAGE_LABELS = {
  Dashboard: 'dashboard',
  Review: 'rvNav',
  Expenses: 'expenses',
  Income: 'income',
  Plans: 'plans',
  Commitments: 'cmNavShort',
  Savings: 'svTitle',
  Notes: 'notes',
  Groceries: 'grTitle',
  Tasks: 'tkNav',
};

/** The sections this member may see, each with only the pages they may open. */
export function visibleSections(hasPermission) {
  return NAV_SECTIONS
    .map((section) => ({ ...section, pages: section.pages.filter((page) => !PAGE_PERMISSIONS[page] || hasPermission(PAGE_PERMISSIONS[page])) }))
    .filter((section) => section.pages.length > 0);
}
