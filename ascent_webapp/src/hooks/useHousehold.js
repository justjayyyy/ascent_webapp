import { useMemo } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useTheme } from '@/components/ThemeProvider';

const SERIES = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)'];

const nameFromEmail = (email = '') => email.split('@')[0] || email;
const initialsOf = (name = '') => {
  const parts = name.trim().split(/[\s._-]+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[1][0] : name.slice(0, 2);
  return letters.toUpperCase();
};

/**
 * The people who share this workspace, keyed by email (transactions carry `created_by`).
 * `isShared` is true once more than one person is in the workspace; `splits` when they also split expenses.
 */
export function useHousehold() {
  const { currentWorkspace } = useAuth();
  const { user } = useTheme();

  return useMemo(() => {
    const known = new Map();
    if (user?.email) known.set(user.email, {});
    (currentWorkspace?.members || []).forEach((m) => {
      if (m?.email && m.status === 'accepted') known.set(m.email, { name: m.name, avatar: m.avatar });
    });
    const members = [...known].map(([email, info], i) => {
      const isMe = email === user?.email;
      const name = (isMe ? user?.full_name : info.name) || nameFromEmail(email);
      return { email, name, avatar: info.avatar, initials: initialsOf(name), isMe, color: `hsl(${SERIES[i % SERIES.length]})` };
    });
    const byEmail = Object.fromEntries(members.map((m) => [m.email, m]));
    const isShared = members.length > 1;
    // Households that pool everything turn splitting off, which also hides who owes whom
    const splits = isShared && currentWorkspace?.settings?.splitExpenses !== false;
    return { members, byEmail, isShared, splits, meEmail: user?.email };
  }, [currentWorkspace?.members, currentWorkspace?.settings?.splitExpenses, user?.email, user?.full_name]);
}
