import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Loader2 } from 'lucide-react';
import { useTheme } from '../ThemeProvider';
import { cn } from '@/lib/utils';

export default function InviteUserDialog({ open, onClose, onSubmit, isLoading }) {
  const { colors, t } = useTheme();
  const [formData, setFormData] = useState({
    invitedEmail: '',
    displayName: '',
    permissions: {
      viewPortfolio: true,
      editPortfolio: false,
      viewExpenses: false,
      editExpenses: false,
      viewNotes: false,
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

    // Close dialog immediately, don't wait for email
    onClose();
    
    // Reset form
    setFormData({
      invitedEmail: '',
      displayName: '',
      permissions: {
        viewPortfolio: true,
        editPortfolio: false,
        viewExpenses: false,
        editExpenses: false,
        viewNotes: false,
        editNotes: false,
        viewGoals: false,
        editGoals: false,
        viewBudgets: false,
        editBudgets: false,
        viewSettings: false,
        manageUsers: false,
      },
    });
    setErrors({});
    
    // Submit in background (email will be sent asynchronously)
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