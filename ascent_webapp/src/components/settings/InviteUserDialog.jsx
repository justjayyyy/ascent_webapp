import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible';
import { Loader2 } from 'lucide-react';
import { useTheme } from '../ThemeProvider';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { ascent } from '@/api/client';

export default function InviteUserDialog({ open, onClose, onSubmit, isLoading }) {
  const { colors, t } = useTheme();

  // Fetch available resources when dialog is open
  const { data: accounts = [], isLoading: isLoadingAccounts } = useQuery({
    queryKey: ['accounts', 'for-invite'],
    queryFn: async () => ascent.entities.Account.list(),
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });

  const { data: notes = [], isLoading: isLoadingNotes } = useQuery({
    queryKey: ['notes', 'for-invite'],
    queryFn: async () => ascent.entities.Note.list(),
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });

  const [formData, setFormData] = useState({
    invitedEmail: '',
    displayName: '',
    permissions: {
      viewPortfolio: true,
      allowedAccountIds: [], // Start with empty (none selected) or select all by default? 
      // Let's assume empty implies "All" if we want backward compat, OR enforce selection.
      // Given "select which one i want to share", forcing explicit selection is better UI,
      // but might be annoying.
      // Decision: If array is empty AND boolean is true, treating it as "All" is easy,
      // but treating it as "None" is safer.
      // However, for Invite, let's start with None selected to force owner to choose?
      // No, owner likely wants to share "everything" by default.
      // Let's populate allowedAccountIds with ALL IDs if viewPortfolio is true?
      // No, let's stick to the logic: empty array = 0 items. 
      // But my backend logic was: undefined = all, array = filter.
      // So if I initialize it as [], it acts as filter -> 0 items.
      editPortfolio: false,
      viewExpenses: false,
      editExpenses: false,
      viewNotes: false,
      allowedNoteIds: [],
      editNotes: false,
      viewGoals: false,
      editGoals: false,
      viewBudgets: false,
      editBudgets: false,
      viewSettings: false,
      manageUsers: false,
    },
  });

  const [errors, setErrors] = useState({});

  const validate = () => {
    const newErrors = {};

    if (!formData.invitedEmail.trim()) {
      newErrors.invitedEmail = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.invitedEmail)) {
      newErrors.invitedEmail = 'Invalid email format';
    }

    if (!formData.displayName.trim()) {
      newErrors.displayName = 'Name is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validate()) return;

    // Close dialog immediately
    onClose();

    // Reset form
    const resetData = {
      invitedEmail: '',
      displayName: '',
      permissions: {
        viewPortfolio: true,
        allowedAccountIds: [],
        editPortfolio: false,
        viewExpenses: false,
        editExpenses: false,
        viewNotes: false,
        allowedNoteIds: [],
        editNotes: false,
        viewGoals: false,
        editGoals: false,
        viewBudgets: false,
        editBudgets: false,
        viewSettings: false,
        manageUsers: false,
      },
    };

    // If we want "Select All" behavior by default when boolean is true, we should have populated ids. 
    // But let's leave as is. User must select.

    setFormData(resetData);
    setErrors({});

    onSubmit(formData);
  };

  const togglePermission = (key) => {
    setFormData({
      ...formData,
      permissions: {
        ...formData.permissions,
        [key]: !formData.permissions[key],
      },
    });
  };

  const toggleResourceId = (resourceKey, id) => {
    const currentIds = formData.permissions[resourceKey] || [];
    const newIds = currentIds.includes(id)
      ? currentIds.filter(i => i !== id)
      : [...currentIds, id];

    setFormData({
      ...formData,
      permissions: {
        ...formData.permissions,
        [resourceKey]: newIds,
      },
    });
  };

  const toggleAllResources = (resourceKey, items) => {
    const currentIds = formData.permissions[resourceKey] || [];
    const allIds = items.map(i => i.id);
    const areAllSelected = allIds.every(id => currentIds.includes(id));

    setFormData({
      ...formData,
      permissions: {
        ...formData.permissions,
        [resourceKey]: areAllSelected ? [] : allIds,
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className={cn(colors.cardBg, colors.cardBorder, "max-w-md max-h-[80vh] overflow-y-auto")}>
        <DialogHeader>
          <DialogTitle className={cn("text-xl font-bold", colors.accentText)}>
            {t('inviteUser')}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="email" className={colors.textSecondary}>{t('emailAddress')} *</Label>
            <Input
              id="email"
              type="email"
              placeholder="user@example.com"
              value={formData.invitedEmail}
              onChange={(e) => setFormData({ ...formData, invitedEmail: e.target.value })}
              className={cn(colors.bgTertiary, colors.border, colors.textPrimary, errors.invitedEmail && 'border-red-500')}
            />
            {errors.invitedEmail && <p className="text-xs text-red-400">{errors.invitedEmail}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="name" className={colors.textSecondary}>{t('displayName')} *</Label>
            <Input
              id="name"
              placeholder="John Doe"
              value={formData.displayName}
              onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
              className={cn(colors.bgTertiary, colors.border, colors.textPrimary, errors.displayName && 'border-red-500')}
            />
            {errors.displayName && <p className="text-xs text-red-400">{errors.displayName}</p>}
          </div>

          <div className={cn("space-y-3 pt-4 border-t", colors.borderLight)}>
            <Label className={colors.textSecondary}>{t('permissions')}</Label>

            <div className="space-y-3">
              {/* Portfolio */}
              <div className="space-y-2">
                <div className="flex items-center justify-between py-2">
                  <div>
                    <p className={cn("text-sm font-medium", colors.textPrimary)}>{t('viewPortfolio')}</p>
                    <p className={cn("text-xs", colors.textTertiary)}>{t('canSeeAccountsPositions')}</p>
                  </div>
                  <Switch
                    checked={formData.permissions.viewPortfolio}
                    onCheckedChange={() => togglePermission('viewPortfolio')}
                  />
                </div>

                <Collapsible open={formData.permissions.viewPortfolio}>
                  <CollapsibleContent>
                    <div className={cn("ml-4 p-3 rounded-md border text-sm space-y-2 animate-in slide-in-from-top-2 duration-300", colors.bgSecondary, colors.border)}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold uppercase opacity-70">{t('selectAccounts')}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs px-2"
                          onClick={() => toggleAllResources('allowedAccountIds', accounts)}
                        >
                          {accounts.length > 0 && accounts.every(i => (formData.permissions.allowedAccountIds || []).includes(i.id)) ? t('deselectAll') : t('selectAll')}
                        </Button>
                      </div>
                      <div className="space-y-2 max-h-32 overflow-y-auto pr-1">
                        {isLoadingAccounts ? (
                          <div className="flex items-center gap-2 text-xs"><Loader2 className="w-3 h-3 animate-spin" /> {t('loadingAccounts')}</div>
                        ) : accounts.length === 0 ? (
                          <p className="text-xs italic opacity-70">{t('noAccountsFound')}</p>
                        ) : (
                          accounts.map(acc => (
                            <div key={acc.id} className="flex items-center gap-2">
                              <Checkbox
                                id={`acc-${acc.id}`}
                                checked={(formData.permissions.allowedAccountIds || []).includes(acc.id)}
                                onCheckedChange={() => toggleResourceId('allowedAccountIds', acc.id)}
                                className="w-4 h-4"
                              />
                              <Label htmlFor={`acc-${acc.id}`} className="font-normal cursor-pointer">{acc.name}</Label>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>

              <div className="flex items-center justify-between py-2">
                <div>
                  <p className={cn("text-sm font-medium", colors.textPrimary)}>{t('editPortfolio')}</p>
                  <p className={cn("text-xs", colors.textTertiary)}>{t('canAddEditAccountsPositions')}</p>
                </div>
                <Switch
                  checked={formData.permissions.editPortfolio}
                  onCheckedChange={() => togglePermission('editPortfolio')}
                />
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <div className="flex items-center justify-between py-2">
                  <div>
                    <p className={cn("text-sm font-medium", colors.textPrimary)}>{t('viewNotes')}</p>
                    <p className={cn("text-xs", colors.textTertiary)}>{t('canSeeNotes')}</p>
                  </div>
                  <Switch
                    checked={formData.permissions.viewNotes}
                    onCheckedChange={() => togglePermission('viewNotes')}
                  />
                </div>

                <Collapsible open={formData.permissions.viewNotes}>
                  <CollapsibleContent>
                    <div className={cn("ml-4 p-3 rounded-md border text-sm space-y-2 animate-in slide-in-from-top-2 duration-300", colors.bgSecondary, colors.border)}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold uppercase opacity-70">{t('selectNotes')}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs px-2"
                          onClick={() => toggleAllResources('allowedNoteIds', notes)}
                        >
                          {notes.length > 0 && notes.every(i => (formData.permissions.allowedNoteIds || []).includes(i.id)) ? t('deselectAll') : t('selectAll')}
                        </Button>
                      </div>
                      <div className="space-y-2 max-h-32 overflow-y-auto pr-1">
                        {isLoadingNotes ? (
                          <div className="flex items-center gap-2 text-xs"><Loader2 className="w-3 h-3 animate-spin" /> {t('loadingNotes')}</div>
                        ) : notes.length === 0 ? (
                          <p className="text-xs italic opacity-70">{t('noNotesFound')}</p>
                        ) : (
                          notes.map(note => (
                            <div key={note.id} className="flex items-center gap-2">
                              <Checkbox
                                id={`note-${note.id}`}
                                checked={(formData.permissions.allowedNoteIds || []).includes(note.id)}
                                onCheckedChange={() => toggleResourceId('allowedNoteIds', note.id)}
                                className="w-4 h-4"
                              />
                              <Label htmlFor={`note-${note.id}`} className="font-normal cursor-pointer text-xs">{note.title || 'Untitled'}</Label>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>

              <div className="flex items-center justify-between py-2">
                <div>
                  <p className={cn("text-sm font-medium", colors.textPrimary)}>{t('editNotes')}</p>
                  <p className={cn("text-xs", colors.textTertiary)}>{t('canAddEditNotes')}</p>
                </div>
                <Switch
                  checked={formData.permissions.editNotes}
                  onCheckedChange={() => togglePermission('editNotes')}
                />
              </div>

              <div className="flex items-center justify-between py-2">
                <div>
                  <p className={cn("text-sm font-medium", colors.textPrimary)}>{t('viewExpenses')}</p>
                  <p className={cn("text-xs", colors.textTertiary)}>{t('canSeeExpenseTransactions')}</p>
                </div>
                <Switch
                  checked={formData.permissions.viewExpenses}
                  onCheckedChange={() => togglePermission('viewExpenses')}
                />
              </div>

              <div className="flex items-center justify-between py-2">
                <div>
                  <p className={cn("text-sm font-medium", colors.textPrimary)}>{t('editExpenses')}</p>
                  <p className={cn("text-xs", colors.textTertiary)}>{t('canAddEditExpenseTransactions')}</p>
                </div>
                <Switch
                  checked={formData.permissions.editExpenses}
                  onCheckedChange={() => togglePermission('editExpenses')}
                />
              </div>

              <div className="flex items-center justify-between py-2">
                <div>
                  <p className={cn("text-sm font-medium", colors.textPrimary)}>{t('viewBudgets')}</p>
                  <p className={cn("text-xs", colors.textTertiary)}>{t('canSeeBudgets')}</p>
                </div>
                <Switch
                  checked={formData.permissions.viewBudgets}
                  onCheckedChange={() => togglePermission('viewBudgets')}
                />
              </div>

              <div className="flex items-center justify-between py-2">
                <div>
                  <p className={cn("text-sm font-medium", colors.textPrimary)}>{t('editBudgets')}</p>
                  <p className={cn("text-xs", colors.textTertiary)}>{t('canAddEditBudgets')}</p>
                </div>
                <Switch
                  checked={formData.permissions.editBudgets}
                  onCheckedChange={() => togglePermission('editBudgets')}
                />
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isLoading}
              className={cn("flex-1 bg-transparent hover:bg-[#5C8374]/20", colors.border, colors.textSecondary)}
            >
              {t('cancel')}
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
              className="flex-1 bg-[#5C8374] hover:bg-[#5C8374]/80 text-white"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {t('sending')}
                </>
              ) : (
                t('sendInvitation')
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}