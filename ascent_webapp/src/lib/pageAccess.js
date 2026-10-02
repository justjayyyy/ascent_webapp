// Which member permission each page needs. Notes is open to every member (the server only returns
// the notes they may see) and Settings gates its own sections.
export const PAGE_PERMISSIONS = {
  Dashboard: 'viewExpenses', // the dashboard shows expense data only
  Review: 'viewExpenses',
  Expenses: 'viewExpenses',
  Income: 'viewExpenses',
  Plans: 'viewExpenses',
  Commitments: 'viewExpenses',
  Savings: 'viewGoals',
};

const FALLBACK_ORDER = ['Dashboard', 'Notes', 'Settings'];

/** Where to send someone who cannot open the page they asked for, or null when there is nowhere. */
export function firstAllowedPage(hasPermission) {
  return FALLBACK_ORDER.find((page) => !PAGE_PERMISSIONS[page] || hasPermission(PAGE_PERMISSIONS[page])) || null;
}
