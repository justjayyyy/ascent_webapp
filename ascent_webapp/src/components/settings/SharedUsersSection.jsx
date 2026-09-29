import React, { memo, useState, useCallback, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { UserPlus, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from '../ThemeProvider';
import SharedUserItem from './SharedUserItem';

const SharedUsersSection = memo(function SharedUsersSection({
  sharedUsers = [],
  onInvite,
  onUpdate,
  onDelete,
  canManageUsers = true
}) {
  const { colors, t } = useTheme();
  // State to track which users are expanded (Array of IDs)
  const [expandedUsers, setExpandedUsers] = useState([]);

  const handleToggleExpand = useCallback((userId) => {
    setExpandedUsers(prev => {
      if (prev.includes(userId)) {
        return prev.filter(id => id !== userId);
      } else {
        return [...prev, userId];
      }
    });
  }, []);

  const statusColors = {
    pending: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/30',
    accepted: 'bg-success/10 text-success border-success/30',
    revoked: 'bg-danger/10 text-danger border-danger/30',
  };

  return (
    <Card className={cn(colors.cardBg, colors.cardBorder)}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <UserPlus className="w-5 h-5 text-primary" />
            <CardTitle className={colors.accentText}>{t('sharedAccess')}</CardTitle>
          </div>
          {canManageUsers && (
            <Button
              onClick={onInvite}
              size="sm"
              className="h-11 bg-primary hover:bg-primary/80 text-primary-foreground sm:h-8"
            >
              <UserPlus className="w-4 h-4 me-2" />
              {t('inviteUser')}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {sharedUsers.length > 0 ? (
          <div className="space-y-4">
            {sharedUsers.map((user) => (
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
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <Shield className="w-12 h-12 text-primary mx-auto mb-3" />
            <p className={cn("mb-4", colors.textTertiary)}>{t('noSharedUsersYet')}</p>
            {canManageUsers && (
              <Button
                onClick={onInvite}
                variant="outline"
                className={cn("bg-transparent hover:bg-primary/20", colors.border, colors.textSecondary)}
              >
                <UserPlus className="w-4 h-4 me-2" />
                {t('inviteFirstUser')}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
});

export default SharedUsersSection;