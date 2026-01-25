import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Plus, Trash2, Tag, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from '../ThemeProvider';
import { translateCategoryName } from '@/lib/categoryTranslations';

export default function CategoryManager({ 
  open, 
  onClose, 
  categories, 
  onAdd, 
  onDelete, 
  isLoading 
}) {
  const { colors, t, language } = useTheme();
  const [formData, setFormData] = useState({
    name: '',
    type: 'Expense',
  });
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    if (!formData.name.trim()) {
      setError(t('categoryNameRequired') || 'Category name is required');
      return;
    }

    const exists = categories.some(
      c => c.name.toLowerCase() === formData.name.trim().toLowerCase()
    );

    if (exists) {
      setError(t('categoryExists') || 'Category already exists');
      return;
    }

    await onAdd({
      name: formData.name.trim(),
      type: formData.type,
      isDefault: false,
    });

    setFormData({ name: '', type: 'Expense' });
  };

  // Get display name for category (translated if it's a default category)
  const getCategoryDisplayName = (category) => {
    if (category.nameKey || category.isDefault) {
      return translateCategoryName(category.nameKey || category.name, language);
    }
    return category.name;
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className={cn(colors.cardBg, colors.cardBorder, "max-w-2xl w-[95vw] sm:w-full max-h-[90vh] overflow-y-auto p-4 sm:p-6")}>
        <DialogHeader className="pb-2 sm:pb-4">
          <DialogTitle className={cn("text-lg sm:text-xl font-bold flex items-center gap-2", colors.accentText)}>
            <Tag className="w-4 h-4 sm:w-5 sm:h-5" />
            {t('manageCategories') || 'Manage Categories'}
          </DialogTitle>
          <DialogDescription className={cn("text-xs sm:text-sm", colors.textTertiary)}>
            {t('addManageCategoriesDesc') || 'Add and manage categories for your transactions'}
          </DialogDescription>
        </DialogHeader>

        {/* Add Form */}
        <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4 mt-2 sm:mt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div className="space-y-1.5 sm:space-y-2">
              <Label className={cn("text-xs sm:text-sm", colors.textSecondary)}>{t('categoryName') || 'Category Name'} *</Label>
              <Input
                type="text"
                placeholder={t('categoryPlaceholder') || 'e.g., Subscription, Gifts'}
                value={formData.name}
                onChange={(e) => {
                  setFormData({ ...formData, name: e.target.value });
                  setError('');
                }}
                className={cn("h-9 sm:h-10 text-sm", colors.bgTertiary, colors.border, colors.textPrimary)}
              />
            </div>

            <div className="space-y-1.5 sm:space-y-2">
              <Label className={cn("text-xs sm:text-sm", colors.textSecondary)}>{t('type')} *</Label>
              <Select 
                value={formData.type} 
                onValueChange={(value) => setFormData({ ...formData, type: value })}
              >
                <SelectTrigger className={cn("h-9 sm:h-10 text-sm", colors.bgTertiary, colors.border, colors.textPrimary)}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className={cn(colors.cardBg, colors.cardBorder)}>
                  <SelectItem value="Expense" className={colors.textPrimary}>{t('expense')}</SelectItem>
                  <SelectItem value="Income" className={colors.textPrimary}>{t('income')}</SelectItem>
                  <SelectItem value="Both" className={colors.textPrimary}>{t('both') || 'Both'}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-xs sm:text-sm text-red-400 bg-red-500/10 rounded-md px-2 sm:px-3 py-1.5 sm:py-2">
              <AlertCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <Button
            type="submit"
            disabled={isLoading || !formData.name.trim()}
            className="w-full h-9 sm:h-10 text-sm sm:text-base bg-[#5C8374] hover:bg-[#5C8374]/80 text-white"
          >
            {isLoading ? (
              <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2 animate-spin" />
            ) : (
              <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2" />
            )}
            {t('addCategory') || 'Add Category'}
          </Button>
        </form>

        {/* All Categories */}
        <div className="mt-4 sm:mt-6 space-y-2 sm:space-y-3">
          <h3 className={cn("text-sm sm:text-base font-semibold", colors.textPrimary)}>{t('allCategories') || 'All Categories'}</h3>
          
          {categories.length === 0 ? (
            <p className={cn("text-xs sm:text-sm text-center py-3 sm:py-4", colors.textTertiary)}>
              {t('noCategoriesYet') || 'No categories yet. Add your first category above.'}
            </p>
          ) : (
            <div className="space-y-1.5 sm:space-y-2">
              {categories.map((category) => (
                <Card key={category.id} className={cn(colors.bgTertiary, colors.borderLight)}>
                  <CardContent className="p-2 sm:p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 sm:gap-2 flex-1 min-w-0">
                        <span className="text-base sm:text-lg flex-shrink-0">{category.icon || '📁'}</span>
                        <span className={cn("text-sm sm:text-base font-medium truncate", colors.textPrimary)}>
                          {getCategoryDisplayName(category)}
                        </span>
                        <span 
                          className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full flex-shrink-0" 
                          style={{ backgroundColor: category.color || '#5C8374' }}
                        />
                        <span className={cn("text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 rounded flex-shrink-0", colors.textTertiary, colors.bgTertiary)}>
                          {category.type === 'Expense' ? t('expense') : category.type === 'Income' ? t('income') : category.type}
                        </span>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => onDelete(category.id)}
                        className="h-7 w-7 sm:h-8 sm:w-8 text-red-400 hover:text-red-300 hover:bg-red-500/20 flex-shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
