import React, { memo, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { UserPlus, Users } from 'lucide-react';
import { useTheme } from '../ThemeProvider';
import SharedUserItem from './SharedUserItem';

const statusColors = {
  pending: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/30',
  accepted: 'bg-success/10 text-success border-success/30',
  revoked: 'bg-danger/10 text-danger border-danger/30',
};

/** Body of the Household "shared access" group: list (or empty state) plus the invite action. */
const SharedUsersSection = memo(function SharedUsersSection({
  sharedUsers = [],
  onInvite,
  onUpdate,
  onDelete,
  canManageUsers = true,
}) {
  const { t } = useTheme();
  const [expandedUsers, setExpandedUsers] = useState([]);

  const handleToggleExpand = useCallback((userId) => {
    setExpandedUsers((prev) => (prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]));
  }, []);

  return (
    <>
      <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
        <h3 className="text-sm font-medium text-foreground">{t('sharedAccess')}</h3>
        {canManageUsers && (
          <Button onClick={onInvite} variant="secondary" className="h-11 rounded-xl sm:h-9">
            <UserPlus className="me-1.5 h-4 w-4" aria-hidden="true" />
            {t('inviteUser')}
          </Button>
        )}
      </div>
      {sharedUsers.length > 0 ? (
        sharedUsers.map((user) => (
          <SharedUserItem
            key={user.id}
            user={user}
            onUpdate={onUpdate}
            onDelete={onDelete}
            canManageUsers={canManageUsers}
            statusColors={statusColors}
            isExpanded={expandedUsers.includes(user.id)}
            onToggleExpand={() => handleToggleExpand(user.id)}
          />
        ))
      ) : (
        <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            <Users className="h-5 w-5" aria-hidden="true" />
          </span>
          <p className="max-w-xs text-sm text-muted-foreground text-pretty">{t('noSharedUsersYet')}</p>
          {canManageUsers && (
            <Button onClick={onInvite} className="h-11 rounded-xl sm:h-9">
              <UserPlus className="me-1.5 h-4 w-4" aria-hidden="true" />
              {t('inviteFirstUser')}
            </Button>
          )}
        </div>
      )}
    </>
  );
});

export default SharedUsersSection;
