import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import { useTheme } from '../ThemeProvider';
import { cn } from '@/lib/utils';

export default function AddAccountDialog({ open, onClose, onSubmit, isLoading, editAccount = null }) {
  const { colors, t, user } = useTheme();
  const [formData, setFormData] = useState({
    name: '',
    type: 'Investment',
    baseCurrency: user?.currency || 'USD',
    initialInvestment: '',
    totalDeposits: 0,
    totalWithdrawals: 0,
    totalFees: 0,
    notes: '',
  });

  React.useEffect(() => {
    if (open && editAccount) {
      setFormData({
        name: editAccount.name,
        type: editAccount.type,
        baseCurrency: editAccount.baseCurrency,
        initialInvestment: editAccount.initialInvestment?.toString() || '',
        totalDeposits: editAccount.totalDeposits || 0,
        totalWithdrawals: editAccount.totalWithdrawals || 0,
        totalFees: editAccount.totalFees || 0,
        notes: editAccount.notes || '',
      });
    } else if (!open) {
      setFormData({
        name: '',
        type: 'Investment',
        baseCurrency: user?.currency || 'USD',
        initialInvestment: '',
        totalDeposits: 0,
        totalWithdrawals: 0,
        totalFees: 0,
        notes: '',
      });
    }
  }, [open, editAccount, user?.currency]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    try {
      await onSubmit({
        ...formData,
        initialInvestment: parseFloat(formData.initialInvestment) || 0,
      });
    } catch (error) {
      // Error is handled by mutation's onError
      console.error('Form submission error:', error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className={cn(colors.cardBg, colors.cardBorder, "max-w-md")}>
        <DialogHeader>
          <DialogTitle className={cn("text-xl font-bold", colors.accentText)}>
            {editAccount ? 'Edit Account' : t('addNewAccount')}
          </DialogTitle>
          <DialogDescription className={colors.textTertiary}>
            {editAccount ? 'Update account information' : t('createNewInvestmentAccount')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="name" className={colors.textSecondary}>{t('accountName')} *</Label>
            <Input
              id="name"
              placeholder={t('accountNamePlaceholder')}
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              className={cn(colors.bgTertiary, colors.border, colors.textPrimary)}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="type" className={colors.textSecondary}>{t('accountType')} *</Label>
              <Select value={formData.type} onValueChange={(value) => setFormData({ ...formData, type: value })}>
                <SelectTrigger className={cn(colors.bgTertiary, colors.border, colors.textPrimary)}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className={cn(colors.cardBg, colors.cardBorder)}>
                  <SelectItem value="Investment" className={colors.textPrimary}>{t('accountTypeInvestment')}</SelectItem>
                  <SelectItem value="IRA" className={colors.textPrimary}>{t('accountTypeIRA')}</SelectItem>
                  <SelectItem value="Pension" className={colors.textPrimary}>{t('accountTypePension')}</SelectItem>
                  <SelectItem value="Savings" className={colors.textPrimary}>{t('accountTypeSavings')}</SelectItem>
                  <SelectItem value="Other" className={colors.textPrimary}>{t('accountTypeOther')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="currency" className={colors.textSecondary}>{t('currency')} *</Label>
              <Select value={formData.baseCurrency} onValueChange={(value) => setFormData({ ...formData, baseCurrency: value })}>
                <SelectTrigger className={cn(colors.bgTertiary, colors.border, colors.textPrimary)}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className={cn(colors.cardBg, colors.cardBorder)}>
                  <SelectItem value="USD" className={colors.textPrimary}>USD ($)</SelectItem>
                  <SelectItem value="EUR" className={colors.textPrimary}>EUR (€)</SelectItem>
                  <SelectItem value="GBP" className={colors.textPrimary}>GBP (£)</SelectItem>
                  <SelectItem value="ILS" className={colors.textPrimary}>ILS (₪)</SelectItem>
                  <SelectItem value="JPY" className={colors.textPrimary}>JPY (¥)</SelectItem>
                  <SelectItem value="CAD" className={colors.textPrimary}>CAD ($)</SelectItem>
                  <SelectItem value="AUD" className={colors.textPrimary}>AUD ($)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {!editAccount && (
            <div className="space-y-2">
              <Label htmlFor="initialInvestment" className={colors.textSecondary}>{t('initialInvestment')} *</Label>
              <Input
                id="initialInvestment"
                type="number"
                step="0.01"
                placeholder="0.00"
                value={formData.initialInvestment}
                onChange={(e) => setFormData({ ...formData, initialInvestment: e.target.value })}
                required
                className={cn(colors.bgTertiary, colors.border, colors.textPrimary)}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="notes" className={colors.textSecondary}>{t('notesOptional')}</Label>
            <Textarea
              id="notes"
              placeholder={t('notesPlaceholder')}
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className={cn(colors.bgTertiary, colors.border, colors.textPrimary, "min-h-[80px]")}
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
                  {editAccount ? 'Updating...' : t('creating')}
                </>
              ) : (
                editAccount ? 'Update Account' : t('createAccount')
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}