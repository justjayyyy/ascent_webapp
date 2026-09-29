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
 * `isShared` is true once more than one person is in the workspace.
 */
export function useHousehold() {
  const { currentWorkspace } = useAuth();
  const { user } = useTheme();

  return useMemo(() => {
    const emails = new Set();
    if (user?.email) emails.add(user.email);
    (currentWorkspace?.members || []).forEach((m) => {
      if (m?.email && m.status !== 'declined') emails.add(m.email);
    });
    const members = [...emails].map((email, i) => {
      const isMe = email === user?.email;
      const name = isMe && user?.full_name ? user.fullName : nameFromEmail(email);
      return { email, name, initials: initialsOf(name), isMe, color: `hsl(${SERIES[i % SERIES.length]})` };
    });
    const byEmail = Object.fromEntries(members.map((m) => [m.email, m]));
    return { members, byEmail, isShared: members.length > 1, meEmail: user?.email };
  }, [currentWorkspace?.members, user?.email, user?.full_name]);
}
