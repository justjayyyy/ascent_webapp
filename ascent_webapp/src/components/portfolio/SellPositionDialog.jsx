import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, TrendingUp, TrendingDown, DollarSign } from 'lucide-react';
import { useTheme } from '../ThemeProvider';
import { cn } from '@/lib/utils';

export default function SellPositionDialog({ 
  open, 
  onClose, 
  onSubmit, 
  isLoading, 
  position,
  accountCurrency,
  hasCashPosition 
}) {
  const { colors, t } = useTheme();
  const [formData, setFormData] = useState({
    quantity: '',
    sellPrice: '',
    returnToCash: true,
    notes: ''
  });

  useEffect(() => {
    if (position && open) {
      setFormData({
        quantity: position.quantity.toString(),
        sellPrice: (position.currentPrice || position.averageBuyPrice).toString(),
        returnToCash: true,
        notes: ''
      });
    }
  }, [position, open]);

  const quantityToSell = parseFloat(formData.quantity) || 0;
  const sellPrice = parseFloat(formData.sellPrice) || 0;
  const totalProceeds = quantityToSell * sellPrice;
  const costBasis = quantityToSell * (position?.averageBuyPrice || 0);
  const profitLoss = totalProceeds - costBasis;
  const profitLossPercent = costBasis > 0 ? (profitLoss / costBasis) * 100 : 0;
  const isPartialSell = quantityToSell < (position?.quantity || 0);
  const isValidQuantity = quantityToSell > 0 && quantityToSell <= (position?.quantity || 0);

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: accountCurrency || 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value || 0);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isValidQuantity) return;

    await onSubmit({
      positionId: position.id,
      quantity: quantityToSell,
      sellPrice,
      totalProceeds,
      profitLoss,
      returnToCash: formData.returnToCash,
      notes: formData.notes,
      isPartialSell,
      remainingQuantity: position.quantity - quantityToSell,
      // Pass original positions for aggregated sells
      originalPositions: position.originalPositions || null
    });
  };

  const handleSellAll = () => {
    setFormData(prev => ({ ...prev, quantity: position.quantity.toString() }));
  };

  if (!position) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className={cn(colors.cardBg, colors.cardBorder, "max-w-md")}>
        <DialogHeader>
          <DialogTitle className={cn("text-xl font-bold flex items-center gap-2", colors.accentText)}>
            <TrendingUp className="w-5 h-5" />
            {t('sellPosition') || 'Sell Position'}
          </DialogTitle>
          <DialogDescription className={colors.textTertiary}>
            {t('sellPositionDescription') || `Sell ${position.symbol} from your portfolio`}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          {/* Position Info */}
          <div className={cn("p-3 rounded-lg", colors.bgTertiary)}>
            <div className="flex justify-between items-center mb-2">
              <span className={cn("font-bold text-lg", colors.textPrimary)}>{position.symbol}</span>
              <span className={cn("text-sm", colors.textTertiary)}>{position.assetType}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className={colors.textTertiary}>{t('currentHolding') || 'Current Holding'}:</span>
                <span className={cn("ml-2 font-medium", colors.textPrimary)}>{position.quantity}</span>
              </div>
              <div>
                <span className={colors.textTertiary}>{t('avgPrice') || 'Avg Price'}:</span>
                <span className={cn("ml-2 font-medium", colors.textPrimary)}>
                  {formatCurrency(position.averageBuyPrice)}
                </span>
              </div>
            </div>
          </div>

          {/* Quantity to Sell */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Label htmlFor="quantity" className={colors.textSecondary}>
                {t('quantityToSell') || 'Quantity to Sell'} *
              </Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleSellAll}
                className="text-xs text-[#5C8374] hover:text-[#5C8374]/80"
              >
                {t('sellAll') || 'Sell All'}
              </Button>
            </div>
            <Input
              id="quantity"
              type="number"
              step="0.01"
              min="0.01"
              max={position.quantity}
              placeholder="0"
              value={formData.quantity}
              onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
              required
              className={cn(
                colors.bgTertiary, 
                colors.border, 
                colors.textPrimary,
                !isValidQuantity && formData.quantity && "border-red-500"
              )}
            />
            {formData.quantity && !isValidQuantity && (
              <p className="text-red-400 text-sm">
                {t('invalidQuantity') || `Max quantity: ${position.quantity}`}
              </p>
            )}
          </div>

          {/* Sell Price */}
          <div className="space-y-2">
            <Label htmlFor="sellPrice" className={colors.textSecondary}>
              {t('sellPrice') || 'Sell Price per Unit'} *
            </Label>
            <Input
              id="sellPrice"
              type="number"
              step="0.01"
              min="0.01"
              placeholder="0.00"
              value={formData.sellPrice}
              onChange={(e) => setFormData({ ...formData, sellPrice: e.target.value })}
              required
              className={cn(colors.bgTertiary, colors.border, colors.textPrimary)}
            />
          </div>

          {/* Proceeds Summary */}
          {isValidQuantity && sellPrice > 0 && (
            <div className={cn("p-3 rounded-lg border", colors.bgTertiary, colors.border)}>
              <h4 className={cn("font-medium mb-2", colors.textPrimary)}>
                {t('saleSummary') || 'Sale Summary'}
              </h4>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className={colors.textTertiary}>{t('totalProceeds') || 'Total Proceeds'}:</span>
                  <span className="font-medium text-green-400">{formatCurrency(totalProceeds)}</span>
                </div>
                <div className="flex justify-between">
                  <span className={colors.textTertiary}>{t('costBasis') || 'Cost Basis'}:</span>
                  <span className={cn("font-medium", colors.textPrimary)}>{formatCurrency(costBasis)}</span>
                </div>
                <div className={cn("flex justify-between pt-1 border-t", colors.borderLight)}>
                  <span className={colors.textTertiary}>{t('profitLoss') || 'Profit/Loss'}:</span>
                  <div className="flex items-center gap-1">
                    {profitLoss >= 0 ? (
                      <TrendingUp className="w-3 h-3 text-green-400" />
                    ) : (
                      <TrendingDown className="w-3 h-3 text-red-400" />
                    )}
                    <span className={cn("font-medium", profitLoss >= 0 ? 'text-green-400' : 'text-red-400')}>
                      {profitLoss >= 0 ? '+' : ''}{formatCurrency(profitLoss)} ({profitLossPercent >= 0 ? '+' : ''}{profitLossPercent.toFixed(2)}%)
                    </span>
                  </div>
                </div>
                {isPartialSell && (
                  <div className="flex justify-between pt-1">
                    <span className={colors.textTertiary}>{t('remaining') || 'Remaining'}:</span>
                    <span className={cn("font-medium", colors.textPrimary)}>
                      {position.quantity - quantityToSell} {position.symbol}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Return to Cash Option */}
          {hasCashPosition && (
            <div className="flex items-center gap-3">
              <Checkbox
                id="returnToCash"
                checked={formData.returnToCash}
                onCheckedChange={(checked) => setFormData({ ...formData, returnToCash: checked })}
              />
              <Label htmlFor="returnToCash" className={cn("cursor-pointer", colors.textSecondary)}>
                <div className="flex items-center gap-1">
                  <DollarSign className="w-4 h-4 text-green-400" />
                  {t('addProceedsToCash') || 'Add proceeds to cash balance'}
                </div>
              </Label>
            </div>
          )}

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes" className={colors.textSecondary}>{t('notesOptional')}</Label>
            <Textarea
              id="notes"
              placeholder={t('sellNotesPlaceholder') || 'Reason for selling, market conditions, etc.'}
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className={cn(colors.bgTertiary, colors.border, colors.textPrimary, "min-h-[60px]")}
            />
          </div>

          {/* Actions */}
          <DialogFooter className="flex gap-3 pt-4">
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
              disabled={isLoading || !isValidQuantity || sellPrice <= 0}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {t('selling') || 'Selling...'}
                </>
              ) : (
                <>
                  <TrendingUp className="w-4 h-4 mr-2" />
                  {isPartialSell 
                    ? (t('sellPartial') || `Sell ${quantityToSell}`) 
                    : (t('sellAll') || 'Sell All')
                  }
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
