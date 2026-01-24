import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { useTheme, translateCategory } from '../ThemeProvider';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { ascent } from '@/api/client';

export default function AddTransactionDialog({ 
  open, 
  onClose, 
  onSubmit, 
  isLoading, 
  accounts = [],
  categories = [],
  editTransaction = null 
}) {
  const { user, t, language, colors } = useTheme();
  const defaultCategory = categories.find(c => c.type === 'Expense' || c.type === 'Both');
  const [formData, setFormData] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    type: 'Expense',
    category: defaultCategory?.name || '',
    description: '',
    amount: '',
    currency: user?.currency || 'USD',
    paymentMethod: '',
    cardId: '',
    relatedAccountId: '',
  });

  const [errors, setErrors] = useState({});

  const { data: cards = [] } = useQuery({
    queryKey: ['cards', user?.id],
    queryFn: async () => {
      if (!user) return [];
      return await ascent.entities.Card.filter({ created_by: user.email, isActive: true }, '-created_date');
    },
    enabled: !!user,
  });

  useEffect(() => {
    if (editTransaction) {
      // Check if this is a duplicate (has no id or _id) - use today's date for duplicates
      const isDuplicate = !editTransaction.id && !editTransaction._id;
      setFormData({
        date: isDuplicate ? format(new Date(), 'yyyy-MM-dd') : editTransaction.date,
        type: editTransaction.type,
        category: editTransaction.category,
        description: editTransaction.description,
        amount: editTransaction.amount.toString(),
        currency: editTransaction.currency,
        paymentMethod: editTransaction.paymentMethod || '',
        cardId: editTransaction.cardId || '',
        relatedAccountId: editTransaction.relatedAccountId || '',
      });
    } else {
      const defaultCategory = categories.find(c => c.type === 'Expense' || c.type === 'Both');
      setFormData({
        date: format(new Date(), 'yyyy-MM-dd'),
        type: 'Expense',
        category: defaultCategory?.name || '',
        description: '',
        amount: '',
        currency: user?.currency || 'USD',
        paymentMethod: '',
        cardId: '',
        relatedAccountId: '',
      });
    }
    setErrors({});
  }, [editTransaction, open, user?.currency, categories]);

  const validate = () => {
    const newErrors = {};

    if (!formData.date) {
      newErrors.date = t('dateRequired');
    }

    if (!formData.description.trim()) {
      newErrors.description = t('descriptionRequired');
    }

    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      newErrors.amount = t('amountGreaterThanZero');
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
      amount: parseFloat(formData.amount),
      relatedAccountId: formData.relatedAccountId || undefined,
    });
  };

  // Filter categories based on transaction type
  const getFilteredCategories = () => {
    return categories.filter(cat => 
      cat.type === formData.type || cat.type === 'Both'
    );
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className={cn(colors.cardBg, colors.cardBorder, "max-w-md max-h-[90vh] overflow-y-auto")}>
        <DialogHeader>
          <DialogTitle className={cn("text-xl font-bold", colors.accentText)}>
            {editTransaction && (editTransaction.id || editTransaction._id)
              ? t('editTransaction')
              : t('addTransactionTitle')
            }
          </DialogTitle>
          <DialogDescription className={colors.textTertiary}>
            {editTransaction && (editTransaction.id || editTransaction._id)
              ? t('updateTransactionDetails')
              : t('recordNewTransaction')
            }
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="date" className={colors.textSecondary}>{t('date')} *</Label>
              <Input
                id="date"
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                max={format(new Date(), 'yyyy-MM-dd')}
                className={cn(colors.bgTertiary, colors.border, colors.textPrimary, errors.date && 'border-red-500')}
              />
              {errors.date && <p className="text-xs text-red-400">{errors.date}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="type" className={colors.textSecondary}>{t('type')} *</Label>
              <Select 
                value={formData.type} 
                onValueChange={(value) => {
                  const availableCategories = categories.filter(cat => cat.type === value || cat.type === 'Both');
                  setFormData({ 
                    ...formData, 
                    type: value,
                    category: availableCategories.length > 0 ? availableCategories[0].name : ''
                  });
                }}
              >
                <SelectTrigger className={cn(colors.bgTertiary, colors.border, colors.textPrimary)}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className={cn(colors.cardBg, colors.cardBorder)}>
                  <SelectItem value="Expense" className={colors.textPrimary}>{t('expense')}</SelectItem>
                  <SelectItem value="Income" className={colors.textPrimary}>{t('income')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="category" className={colors.textSecondary}>{t('category')} *</Label>
            <Select value={formData.category} onValueChange={(value) => setFormData({ ...formData, category: value })}>
              <SelectTrigger className={cn(colors.bgTertiary, colors.border, colors.textPrimary)}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className={cn(colors.cardBg, colors.cardBorder)}>
                {getFilteredCategories().map((category) => (
                  <SelectItem key={category.id} value={category.name} className={colors.textPrimary}>
                    {translateCategory(category.name, language)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description" className={colors.textSecondary}>{t('description')} *</Label>
            <Textarea
              id="description"
              placeholder={t('descriptionPlaceholder')}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className={cn(colors.bgTertiary, colors.border, colors.textPrimary, "min-h-[80px]", errors.description && 'border-red-500')}
            />
            {errors.description && <p className="text-xs text-red-400">{errors.description}</p>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="amount" className={colors.textSecondary}>{t('amount')} *</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0.00"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                className={cn(colors.bgTertiary, colors.border, colors.textPrimary, errors.amount && 'border-red-500')}
              />
              {errors.amount && <p className="text-xs text-red-400">{errors.amount}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="currency" className={colors.textSecondary}>{t('currency')} *</Label>
              <Select value={formData.currency} onValueChange={(value) => setFormData({ ...formData, currency: value })}>
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

          <div className="space-y-2">
            <Label className={colors.textSecondary}>{t('paymentMethod')} ({t('optional')})</Label>
            <Select
              value={formData.paymentMethod}
              onValueChange={(value) => {
                setFormData({ ...formData, paymentMethod: value, cardId: value === 'Card' ? formData.cardId : '' });
              }}
            >
              <SelectTrigger className={cn(colors.bgTertiary, colors.border, colors.textPrimary)}>
                <SelectValue placeholder={t('selectPaymentMethod')} />
              </SelectTrigger>
              <SelectContent className={cn(colors.cardBg, colors.cardBorder)}>
                <SelectItem value={null} className={colors.textPrimary}>{t('none')}</SelectItem>
                <SelectItem value="Card" className={colors.textPrimary}>{t('card')}</SelectItem>
                <SelectItem value="Cash" className={colors.textPrimary}>{t('cash')}</SelectItem>
                <SelectItem value="Transfer" className={colors.textPrimary}>{t('transfer')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {formData.paymentMethod === 'Card' && (
            <div className="space-y-2">
              <Label className={colors.textSecondary}>{t('selectCard')}</Label>
              <Select
                value={formData.cardId}
                onValueChange={(value) => setFormData({ ...formData, cardId: value, paymentMethod: 'Card' })}
              >
                <SelectTrigger className={cn(colors.bgTertiary, colors.border, colors.textPrimary)}>
                  <SelectValue placeholder={t('selectACard')} />
                </SelectTrigger>
                <SelectContent className={cn(colors.cardBg, colors.cardBorder)}>
                  {cards.length === 0 ? (
                    <SelectItem value="none" disabled className={colors.textTertiary}>
                      {t('noCardsAvailable')}
                    </SelectItem>
                  ) : (
                    cards.map((card) => (
                      <SelectItem key={card.id} value={card.id} className={colors.textPrimary}>
                        {card.cardName} •••• {card.lastFourDigits}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="relatedAccount" className={colors.textSecondary}>
              {t('relatedAccount')}
            </Label>
            <Select 
              value={formData.relatedAccountId} 
              onValueChange={(value) => setFormData({ ...formData, relatedAccountId: value })}
            >
              <SelectTrigger className={cn(colors.bgTertiary, colors.border, colors.textPrimary)}>
                <SelectValue placeholder={t('selectAccountOptional')} />
              </SelectTrigger>
              <SelectContent className={cn(colors.cardBg, colors.cardBorder)}>
                <SelectItem value={null} className={colors.textPrimary}>{t('none')}</SelectItem>
                {accounts.map((account) => (
                  <SelectItem key={account.id} value={account.id} className={colors.textPrimary}>
                    {account.name} ({account.type})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className={cn("text-xs", colors.textTertiary)}>
              {t('linkTransactionToAccount')}
            </p>
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
                  {editTransaction && (editTransaction.id || editTransaction._id) ? t('updating') : t('adding')}
                </>
              ) : (
                editTransaction && (editTransaction.id || editTransaction._id) ? t('updateTransaction') : t('addTransaction')
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}