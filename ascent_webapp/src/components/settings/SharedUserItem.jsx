import React, { useCallback, memo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Mail, Trash2, Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from '../ThemeProvider';

const SharedUserItem = memo(function SharedUserItem({
  user,
  onUpdate,
  onDelete,
  canManageUsers,
  statusColors,
  isExpanded,
  onToggleExpand
}) {
  const { colors, t } = useTheme();

  const togglePermission = useCallback((key) => {
    try {
      const updatedPermissions = {
        ...user.permissions,
        [key]: !user.permissions[key],
      };
      onUpdate(user.id, { permissions: updatedPermissions });
    } catch (e) {
      console.error('[SharedUserItem] Error toggling permission:', e);
    }
  }, [user.id, user.permissions, onUpdate]);

  const toggleExpanded = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    onToggleExpand();
  }, [onToggleExpand]);

  const handleDelete = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    onDelete(user.id);
  }, [user.id, onDelete]);

  return (
    <div className={cn("p-4 rounded-lg border", colors.bgTertiary, colors.border)}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={cn("w-10 h-10 rounded-full bg-[#5C8374]/20 flex items-center justify-center font-semibold", colors.accentText)}>
            {user.displayName?.[0]?.toUpperCase() || user.invitedEmail[0].toUpperCase()}
          </div>
          <div>
            <p className={cn("font-semibold", colors.textPrimary)}>{user.displayName || 'Unnamed User'}</p>
            <div className="flex items-center gap-2 mt-1">
              <Mail className={cn("w-3 h-3", colors.textTertiary)} />
              <p className={cn("text-sm", colors.textTertiary)}>{user.invitedEmail}</p>
            </div>
            <Badge className={cn('text-xs border mt-2', statusColors[user.status])}>
              {t(user.status)}
            </Badge>
          </div>
        </div>
        {canManageUsers && (
          <div className="flex gap-2">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={toggleExpanded}
              className={cn("h-8 w-8 hover:bg-[#5C8374]/20", colors.textSecondary)}
            >
              {isExpanded ? (
                <EyeOff className="w-4 h-4" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={handleDelete}
              className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-500/20"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>

      {isExpanded && canManageUsers && (
        <div className={cn("mt-4 pt-4 border-t space-y-2", colors.borderLight)}>
          {[
            'viewPortfolio', 'editPortfolio',
            'viewExpenses', 'editExpenses',
            'viewNotes', 'editNotes',
            'viewGoals', 'editGoals',
            'viewBudgets', 'editBudgets'
          ].map((perm) => (
            <div key={perm} className="flex items-center justify-between py-2">
              <Label className={cn("text-sm", colors.textPrimary)}>{t(perm)}</Label>
              <Switch
                checked={user.permissions?.[perm] || false}
                onCheckedChange={(checked) => {
                  togglePermission(perm);
                }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

export default SharedUserItem;
