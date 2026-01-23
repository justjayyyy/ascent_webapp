import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { useTheme } from '../ThemeProvider';
import { cn } from '@/lib/utils';

export default function AddGoalDialog({ open, onClose, onSubmit, isLoading, editGoal = null, accounts = [] }) {
  const { colors, t } = useTheme();
  const [formData, setFormData] = useState({
    title: '',
    targetAmount: '',
    currentAmount: '',
    targetDate: '',
    category: 'Savings',
    status: 'Active',
    linkedAccountIds: [],
    targetReturnPercent: '8',
    notes: '',
  });

  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (editGoal) {
      setFormData({
        title: editGoal.title,
        targetAmount: editGoal.targetAmount.toString(),
        currentAmount: editGoal.currentAmount?.toString() || '0',
        targetDate: editGoal.targetDate,
        category: editGoal.category,
        status: editGoal.status || 'Active',
        linkedAccountIds: editGoal.linkedAccountIds || [],
        targetReturnPercent: editGoal.targetReturnPercent?.toString() || '8',
        notes: editGoal.notes || '',
      });
    } else {
      setFormData({
        title: '',
        targetAmount: '',
        currentAmount: '0',
        targetDate: '',
        category: 'Savings',
        status: 'Active',
        linkedAccountIds: [],
        targetReturnPercent: '8',
        notes: '',
      });
    }
    setErrors({});
  }, [editGoal, open]);

  const validate = () => {
    const newErrors = {};

    if (!formData.title.trim()) {
      newErrors.title = 'Title is required';
    }

    if (!formData.targetAmount || parseFloat(formData.targetAmount) <= 0) {
      newErrors.targetAmount = 'Target amount must be greater than 0';
    }

    if (!formData.targetDate) {
      newErrors.targetDate = 'Target date is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validate()) {
      return;
    }

    await onSubmit({
      ...formData,
      targetAmount: parseFloat(formData.targetAmount),
      currentAmount: parseFloat(formData.currentAmount) || 0,
      targetReturnPercent: parseFloat(formData.targetReturnPercent) || 8,
    });
  };

  const toggleAccount = (accountId) => {
    setFormData(prev => ({
      ...prev,
      linkedAccountIds: prev.linkedAccountIds.includes(accountId)
        ? prev.linkedAccountIds.filter(id => id !== accountId)
        : [...prev.linkedAccountIds, accountId]
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className={cn(colors.cardBg, colors.cardBorder, "max-w-md")}>
        <DialogHeader>
          <DialogTitle className={cn("text-xl font-bold", colors.accentText)}>
            {editGoal ? t('editFinancialGoal') : t('addFinancialGoal')}
          </DialogTitle>
          <DialogDescription className={colors.textTertiary}>
            {t('setAndTrackObjectives')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="title" className={colors.textSecondary}>{t('goalTitle')} *</Label>
            <Input
              id="title"
              placeholder={t('goalTitlePlaceholder')}
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className={cn(colors.bgTertiary, colors.border, colors.textPrimary, errors.title && 'border-red-500')}
            />
            {errors.title && <p className="text-xs text-red-400">{errors.title}</p>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="category" className={colors.textSecondary}>{t('category')} *</Label>
              <Select value={formData.category} onValueChange={(value) => setFormData({ ...formData, category: value })}>
                <SelectTrigger className={cn(colors.bgTertiary, colors.border, colors.textPrimary)}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className={cn(colors.cardBg, colors.cardBorder)}>
                  <SelectItem value="Retirement">Retirement</SelectItem>
                  <SelectItem value="Emergency Fund">Emergency Fund</SelectItem>
                  <SelectItem value="Investment">Investment</SelectItem>
                  <SelectItem value="Savings">Savings</SelectItem>
                  <SelectItem value="Debt Payoff">Debt Payoff</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="status" className={colors.textSecondary}>{t('type')}</Label>
              <Select value={formData.status} onValueChange={(value) => setFormData({ ...formData, status: value })}>
                <SelectTrigger className={cn(colors.bgTertiary, colors.border, colors.textPrimary)}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className={cn(colors.cardBg, colors.cardBorder)}>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Completed">Completed</SelectItem>
                  <SelectItem value="Paused">Paused</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="targetAmount" className={colors.textSecondary}>{t('targetAmount')} *</Label>
              <Input
                id="targetAmount"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0.00"
                value={formData.targetAmount}
                onChange={(e) => setFormData({ ...formData, targetAmount: e.target.value })}
                className={cn(colors.bgTertiary, colors.border, colors.textPrimary, errors.targetAmount && 'border-red-500')}
              />
              {errors.targetAmount && <p className="text-xs text-red-400">{errors.targetAmount}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="currentAmount" className={colors.textSecondary}>{t('currentAmount')}</Label>
              <Input
                id="currentAmount"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={formData.currentAmount}
                onChange={(e) => setFormData({ ...formData, currentAmount: e.target.value })}
                className={cn(colors.bgTertiary, colors.border, colors.textPrimary)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="targetDate" className={colors.textSecondary}>{t('targetDate')} *</Label>
            <Input
              id="targetDate"
              type="date"
              value={formData.targetDate}
              onChange={(e) => setFormData({ ...formData, targetDate: e.target.value })}
              min={format(new Date(), 'yyyy-MM-dd')}
              className={cn(colors.bgTertiary, colors.border, colors.textPrimary, errors.targetDate && 'border-red-500')}
            />
            {errors.targetDate && <p className="text-xs text-red-400">{errors.targetDate}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="targetReturn" className={colors.textSecondary}>{t('expectedAnnualReturn')}</Label>
            <Input
              id="targetReturn"
              type="number"
              step="0.1"
              min="0"
              max="100"
              placeholder="8"
              value={formData.targetReturnPercent}
              onChange={(e) => setFormData({ ...formData, targetReturnPercent: e.target.value })}
              className={cn(colors.bgTertiary, colors.border, colors.textPrimary)}
            />
            <p className={cn("text-xs", colors.textTertiary)}>{t('expectedReturnHelp')}</p>
          </div>

          {accounts.length > 0 && (
            <div className="space-y-3">
              <Label className={colors.textSecondary}>{t('linkInvestmentAccounts')}</Label>
              <div className={cn("border rounded-lg p-3 space-y-2 max-h-40 overflow-y-auto", colors.bgTertiary, colors.border)}>
                {accounts.map(account => (
                  <div key={account.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`account-${account.id}`}
                      checked={formData.linkedAccountIds.includes(account.id)}
                      onCheckedChange={() => toggleAccount(account.id)}
                      className="border-[#5C8374]/50"
                    />
                    <label
                      htmlFor={`account-${account.id}`}
                      className={cn("text-sm cursor-pointer flex-1", colors.textPrimary)}
                    >
                      {account.name} ({account.type})
                    </label>
                  </div>
                ))}
              </div>
              <p className={cn("text-xs", colors.textTertiary)}>{t('progressWillTrack')}</p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="notes" className={colors.textSecondary}>{t('notesOptional')}</Label>
            <Textarea
              id="notes"
              placeholder={t('notesPlaceholder')}
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className={cn(colors.bgTertiary, colors.border, colors.textPrimary, "min-h-[60px]")}
            />
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
                  {editGoal ? t('updating') : t('adding')}
                </>
              ) : (
                editGoal ? t('updateGoal') : t('addGoalBtn')
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}