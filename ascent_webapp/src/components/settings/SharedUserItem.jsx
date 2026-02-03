import React, { useCallback, memo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Mail, Trash2, Eye, EyeOff, Loader2 } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { useTheme } from '../ThemeProvider';
import { useQuery } from '@tanstack/react-query';
import { ascent } from '@/api/client';

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

  // Fetch all accounts and notes for the owner to select from
  // We only fetch if expanded to save resources
  const { data: accounts = [], isLoading: isLoadingAccounts } = useQuery({
    queryKey: ['accounts', 'for-permissions'],
    queryFn: async () => ascent.entities.Account.list(),
    enabled: isExpanded && canManageUsers,
    staleTime: 5 * 60 * 1000,
  });

  const { data: notes = [], isLoading: isLoadingNotes } = useQuery({
    queryKey: ['notes', 'for-permissions'],
    queryFn: async () => ascent.entities.Note.list(),
    enabled: isExpanded && canManageUsers,
    staleTime: 5 * 60 * 1000,
  });

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

  const toggleResourceId = useCallback((resourceKey, resourceId) => {
    try {
      const currentIds = user.permissions?.[resourceKey] || [];
      const isSelected = currentIds.includes(resourceId);

      let newIds;
      if (isSelected) {
        newIds = currentIds.filter(id => id !== resourceId);
      } else {
        newIds = [...currentIds, resourceId];
      }

      const updatedPermissions = {
        ...user.permissions,
        [resourceKey]: newIds,
      };

      onUpdate(user.id, { permissions: updatedPermissions });
    } catch (e) {
      console.error('[SharedUserItem] Error toggling resource ID:', e);
    }
  }, [user.id, user.permissions, onUpdate]);

  // Select/Deselect All helper
  const toggleAllResources = useCallback((resourceKey, allItems) => {
    const currentIds = user.permissions?.[resourceKey] || [];
    const allIds = allItems.map(item => item.id);

    // If all are selected, deselect all. Otherwise, select all.
    const areAllSelected = allIds.every(id => currentIds.includes(id));

    const updatedPermissions = {
      ...user.permissions,
      [resourceKey]: areAllSelected ? [] : allIds,
    };

    onUpdate(user.id, { permissions: updatedPermissions });
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

  const permissionsList = [
    {
      key: 'viewPortfolio',
      label: 'viewPortfolio',
      subResource: 'allowedAccountIds',
      items: accounts,
      isLoading: isLoadingAccounts,
      itemName: 'name',
      selectLabel: 'selectAccounts',
      emptyLabel: 'noAccountsFound',
      loadingLabel: 'loadingAccounts'
    },
    { key: 'editPortfolio', label: 'editPortfolio' },
    { key: 'viewExpenses', label: 'viewExpenses' },
    { key: 'editExpenses', label: 'editExpenses' },
    {
      key: 'viewNotes',
      label: 'viewNotes',
      subResource: 'allowedNoteIds',
      items: notes,
      isLoading: isLoadingNotes,
      itemName: 'title',
      selectLabel: 'selectNotes',
      emptyLabel: 'noNotesFound',
      loadingLabel: 'loadingNotes'
    },
    { key: 'editNotes', label: 'editNotes' },
    { key: 'viewBudgets', label: 'viewBudgets' },
    { key: 'editBudgets', label: 'editBudgets' },
  ];

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
        <div className={cn("mt-4 pt-4 border-t space-y-4", colors.borderLight)}>
          {permissionsList.map((perm) => (
            <div key={perm.key} className="space-y-2">
              <div className="flex items-center justify-between py-1">
                <Label className={cn("text-sm", colors.textPrimary)}>{t(perm.label)}</Label>
                <Switch
                  checked={user.permissions?.[perm.key] || false}
                  onCheckedChange={() => togglePermission(perm.key)}
                />
              </div>

              {/* Granular Permissions Selection using Collapsible */}
              {perm.subResource && (
                <Collapsible open={!!user.permissions?.[perm.key]}>
                  <CollapsibleContent>
                    <div className={cn("ml-4 p-3 rounded-md border text-sm space-y-2 animate-in slide-in-from-top-2 duration-300", colors.bgSecondary, colors.border)}>
                      <div className="flex items-center justify-between mb-2">
                        <span className={cn("text-xs font-semibold uppercase", colors.textTertiary)}>
                          {t(perm.selectLabel) || 'Select Items'}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs px-2"
                          onClick={() => toggleAllResources(perm.subResource, perm.items)}
                        >
                          {perm.items.length > 0 && perm.items.every(i => (user.permissions?.[perm.subResource] || []).includes(i.id))
                            ? (t('deselectAll') || 'Deselect All')
                            : (t('selectAll') || 'Select All')
                          }
                        </Button>
                      </div>

                      {perm.isLoading ? (
                        <div className="flex items-center gap-2 text-xs py-2">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          {t(perm.loadingLabel) || 'Loading...'}
                        </div>
                      ) : perm.items.length === 0 ? (
                        <p className={cn("text-xs italic", colors.textTertiary)}>{t(perm.emptyLabel) || 'No items found'}</p>
                      ) : (
                        <div className="space-y-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                          {perm.items.map(item => (
                            <div key={item.id} className="flex items-center gap-2">
                              <Checkbox
                                id={`${perm.subResource}-${item.id}-${user.id}`} // Unique ID
                                checked={(user.permissions?.[perm.subResource] || []).includes(item.id)}
                                onCheckedChange={() => toggleResourceId(perm.subResource, item.id)}
                                className="w-4 h-4"
                              />
                              <Label
                                htmlFor={`${perm.subResource}-${item.id}-${user.id}`}
                                className={cn("text-sm cursor-pointer font-normal", colors.textSecondary)}
                              >
                                {item[perm.itemName] || 'Untitled'}
                              </Label>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

export default SharedUserItem;
