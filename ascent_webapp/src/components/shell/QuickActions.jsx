import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';

// The dock's + means "add here": the page on screen registers what that is (an expense, income, a
// plan or plan cost, a note), and optionally a short menu for a long press (a list, a photo note).
// Pages without one fall back to the shell's quick add and its menu.

const QuickActionsContext = createContext(null);

export function QuickActionsProvider({ fallback, fallbackMenu, children }) {
  const current = useRef(null); // { run, menu }
  const fallbackRef = useRef({ run: fallback, menu: fallbackMenu });
  fallbackRef.current = { run: fallback, menu: fallbackMenu };

  const register = useCallback((entry) => {
    current.current = entry;
    return () => { if (current.current === entry) current.current = null; };
  }, []);

  const create = useCallback(() => (current.current || fallbackRef.current).run?.(), []);
  const menu = useCallback(() => (current.current?.menu?.length ? current.current.menu : fallbackRef.current.menu) || [], []);

  const value = useMemo(() => ({ register, create, menu }), [register, create, menu]);
  return <QuickActionsContext.Provider value={value}>{children}</QuickActionsContext.Provider>;
}

export const useQuickActions = () => useContext(QuickActionsContext);

/**
 * Make the dock's + run `fn` while this page is on screen (null: use the default quick add).
 * `menu` items ({ id, label, icon, run }) replace the default long-press menu.
 */
export function usePageCreateAction(fn, menu) {
  const ctx = useContext(QuickActionsContext);
  const latest = useRef({ fn, menu });
  latest.current = { fn, menu };
  const enabled = !!fn;
  useEffect(() => {
    if (!ctx || !enabled) return undefined;
    const entry = {
      run: () => latest.current.fn?.(),
      get menu() { return latest.current.menu; },
    };
    return ctx.register(entry);
  }, [ctx, enabled]);
}
