import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Plus, Trash2, Edit, Target } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme, translateCategory } from '../ThemeProvider';

export default function BudgetManager({ 
  open, 
  onClose, 
  budgets,
  categories = [],
  onAdd, 
  onUpdate, 
  onDelete, 
  isLoading 
}) {
  const { colors, t, language, user } = useTheme();
  const [editingBudget, setEditingBudget] = useState(null);
  
  // Calculate available categories
  const usedCategories = useMemo(() => 
    budgets.map(b => b.category), 
    [budgets]
  );
  
  const expenseCategories = useMemo(() => 
    categories.filter(cat => cat.type === 'Expense' || cat.type === 'Both'),
    [categories]
  );
  
  const availableCategories = useMemo(() => 
    expenseCategories.filter(cat => !usedCategories.includes(cat.name)),
    [expenseCategories, usedCategories]
  );

  const [formData, setFormData] = useState({
    category: '',
    monthlyLimit: '',
    alertThreshold: 80,
    currency: user?.currency || 'USD',
  });

  // Set initial category when available categories change or dialog opens
  useEffect(() => {
    if (open && !editingBudget && availableCategories.length > 0 && !formData.category) {
      setFormData(prev => ({
        ...prev,
        category: availableCategories[0].name,
        currency: user?.currency || 'USD',
      }));
    }
  }, [open, availableCategories, editingBudget, user?.currency]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.monthlyLimit || parseFloat(formData.monthlyLimit) <= 0) {
      return;
    }

    // Ensure alertThreshold is a valid number between 1-100, default to 80
    const threshold = parseInt(formData.alertThreshold);
    const validThreshold = isNaN(threshold) ? 80 : Math.min(100, Math.max(1, threshold));

    const budgetData = {
      ...formData,
      monthlyLimit: parseFloat(formData.monthlyLimit),
      alertThreshold: validThreshold,
    };

    if (editingBudget) {
      await onUpdate(editingBudget.id, budgetData);
      setEditingBudget(null);
    } else {
      await onAdd(budgetData);
    }

    setFormData({
      category: availableCategories.length > 0 ? availableCategories[0].name : '',
      monthlyLimit: '',
      alertThreshold: 80,
      currency: user?.currency || 'USD',
    });
  };

  const handleEdit = (budget) => {
    setEditingBudget(budget);
    setFormData({
      category: budget.category,
      monthlyLimit: budget.monthlyLimit.toString(),
      alertThreshold: budget.alertThreshold || 80,
      currency: budget.currency,
    });
  };

  const handleCancel = () => {
    setEditingBudget(null);
    setFormData({
      category: availableCategories.length > 0 ? availableCategories[0].name : '',
      monthlyLimit: '',
      alertThreshold: 80,
      currency: user?.currency || 'USD',
    });
  };

  // Get available categories when editing (include the current budget's category)
  const editAvailableCategories = editingBudget 
    ? expenseCategories.filter(cat => !usedCategories.includes(cat.name) || cat.name === editingBudget.category)
    : availableCategories;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className={cn(colors.cardBg, colors.cardBorder, "max-w-2xl max-h-[90vh] overflow-y-auto")}>
        <DialogHeader>
          <DialogTitle className={cn("text-xl font-bold flex items-center gap-2", colors.accentText)}>
            <Target className="w-5 h-5" />
            {t('manageBudgets')}
          </DialogTitle>
          <DialogDescription className={colors.textTertiary}>
            {t('setBudgetLimits')}
          </DialogDescription>
        </DialogHeader>

        {/* Add/Edit Form */}
        {availableCategories.length === 0 && !editingBudget ? (
          <div className={cn("text-center py-6", colors.textTertiary)}>
            <Target className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="font-medium">{t('allCategoriesHaveBudgets')}</p>
            <p className="text-sm mt-1">{t('deleteBudgetToAddNew')}</p>
          </div>
        ) : (
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className={colors.textSecondary}>{t('category')} *</Label>
              <Select 
                value={formData.category} 
                onValueChange={(value) => setFormData({ ...formData, category: value })}
                disabled={editingBudget !== null}
              >
                <SelectTrigger className={cn(colors.bgTertiary, colors.border, colors.textPrimary)}>
                  <SelectValue placeholder={t('selectCategory')} />
                </SelectTrigger>
                <SelectContent className={cn(colors.cardBg, colors.cardBorder)}>
                  {editAvailableCategories.map((category) => (
                    <SelectItem key={category.id} value={category.name} className={colors.textPrimary}>
                      {translateCategory(category.name, language)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className={colors.textSecondary}>{t('monthlyLimit')} *</Label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                placeholder="1000"
                value={formData.monthlyLimit}
                onChange={(e) => setFormData({ ...formData, monthlyLimit: e.target.value })}
                className={cn(colors.bgTertiary, colors.border, colors.textPrimary)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className={colors.textSecondary}>{t('alertThreshold')} (%) *</Label>
            <Input
              type="number"
              min="1"
              max="100"
              placeholder="80"
              value={formData.alertThreshold}
              onChange={(e) => {
                const value = e.target.value;
                // Allow empty string for typing, but clamp to valid range
                const numValue = value === '' ? '' : Math.min(100, Math.max(1, parseInt(value) || 80));
                setFormData({ ...formData, alertThreshold: numValue });
              }}
              className={cn(colors.bgTertiary, colors.border, colors.textPrimary)}
            />
            <p className={cn("text-xs", colors.textTertiary)}>
              {t('alertThresholdHelp')}
            </p>
          </div>

          <div className="flex gap-3">
            {editingBudget && (
              <Button
                type="button"
                variant="outline"
                onClick={handleCancel}
                className={cn("flex-1 bg-transparent hover:bg-[#5C8374]/20", colors.border, colors.textSecondary)}
              >
                {t('cancel')}
              </Button>
            )}
            <Button
              type="submit"
              disabled={isLoading || !formData.monthlyLimit || !formData.category}
              className={cn("flex-1 bg-[#5C8374] hover:bg-[#5C8374]/80 text-white", editingBudget && "flex-1")}
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : editingBudget ? (
                <Edit className="w-4 h-4 mr-2" />
              ) : (
                <Plus className="w-4 h-4 mr-2" />
              )}
              {editingBudget ? t('updateBudget') : t('addBudget')}
            </Button>
          </div>
        </form>
        )}

        {/* Existing Budgets */}
        {budgets.length > 0 && (
          <div className="mt-6 space-y-3">
            <h3 className={cn("font-semibold", colors.textPrimary)}>{t('currentBudgets')}</h3>
            {budgets.map((budget) => (
              <Card key={budget.id} className={cn(colors.bgTertiary, colors.borderLight)}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className={cn("font-medium", colors.textPrimary)}>
                        {translateCategory(budget.category, language)}
                      </p>
                      <p className={cn("text-sm", colors.textTertiary)}>
                        {new Intl.NumberFormat(language === 'he' ? 'he-IL' : language === 'ru' ? 'ru-RU' : 'en-US', {
                          style: 'currency',
                          currency: budget.currency || user?.currency || 'USD',
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 0,
                        }).format(budget.monthlyLimit)}{t('perMonth')}
                        {' • '}{t('alertAt')} {budget.alertThreshold || 80}%
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleEdit(budget)}
                        className={cn("h-8 w-8 hover:bg-[#5C8374]/20", colors.textSecondary)}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => onDelete(budget.id)}
                        className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-500/20"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}