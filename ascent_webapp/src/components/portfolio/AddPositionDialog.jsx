import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2 } from 'lucide-react';
import { useTheme } from '../ThemeProvider';
import { cn } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function AddPositionDialog({ open, onClose, onSubmit, onSubmitDayTrade, isLoading, accountCurrency, editPosition = null, editDayTrade = null, cashBalance = null, hasCashPosition = false }) {
  const { colors, t } = useTheme();
  const [activeTab, setActiveTab] = useState('position');
  const [deductFromCash, setDeductFromCash] = useState(true);
  const [formData, setFormData] = useState(editPosition || {
    symbol: '',
    assetType: 'Stock',
    quantity: '',
    averageBuyPrice: '',
    currency: accountCurrency,
    date: new Date().toISOString().split('T')[0],
    strikePrice: '',
    expirationDate: '',
    notes: '',
  });
  const [dayTradeData, setDayTradeData] = useState(editDayTrade || {
    date: new Date().toISOString().split('T')[0],
    profitLoss: '',
    notes: '',
  });

  React.useEffect(() => {
    if (editPosition) {
      setFormData(editPosition);
      setActiveTab('position');
    } else if (editDayTrade) {
      setDayTradeData({
        date: editDayTrade.date,
        profitLoss: editDayTrade.profitLoss.toString(),
        notes: editDayTrade.notes || '',
      });
      setActiveTab('daytrade');
    } else {
      setFormData({
        symbol: '',
        assetType: 'Stock',
        quantity: '',
        averageBuyPrice: '',
        currency: accountCurrency,
        date: new Date().toISOString().split('T')[0],
        strikePrice: '',
        expirationDate: '',
        notes: '',
      });
      setDayTradeData({
        date: new Date().toISOString().split('T')[0],
        profitLoss: '',
        notes: '',
      });
      setActiveTab('position');
    }
  }, [editPosition, editDayTrade, accountCurrency, open]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const submitData = {
      ...formData,
      symbol: formData.symbol.toUpperCase(),
      quantity: parseFloat(formData.quantity) || 0,
      averageBuyPrice: parseFloat(formData.averageBuyPrice) || 0,
    };

    if (formData.assetType === 'Option') {
      submitData.strikePrice = parseFloat(formData.strikePrice) || 0;
      submitData.expirationDate = formData.expirationDate;
    }

    // Add deductFromCash flag for non-cash positions (not when editing)
    if (!editPosition && formData.assetType !== 'Cash' && cashBalance !== null) {
      submitData.deductFromCash = deductFromCash;
    }

    await onSubmit(submitData);
  };
  
  // Calculate purchase cost for display
  const purchaseCost = parseFloat(formData.quantity || 0) * parseFloat(formData.averageBuyPrice || 0);
  const hasSufficientCash = cashBalance !== null && cashBalance >= purchaseCost;

  const handleDayTradeSubmit = async (e) => {
    e.preventDefault();
    await onSubmitDayTrade({
      date: dayTradeData.date,
      profitLoss: parseFloat(dayTradeData.profitLoss),
      notes: dayTradeData.notes,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className={cn(colors.cardBg, colors.cardBorder, "max-w-md")}>
        <DialogHeader>
          <DialogTitle className={cn("text-xl font-bold", colors.accentText)}>
            {editPosition ? t('editPosition') : editDayTrade ? 'Edit Day Trade' : 'Add to Portfolio'}
          </DialogTitle>
          <DialogDescription className={colors.textTertiary}>
            {editPosition ? t('updatePositionDetails') : editDayTrade ? 'Update your day trade record' : 'Add a position or record day trading P&L'}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4">
          <TabsList className={cn("grid w-full grid-cols-2 mb-4", colors.bgTertiary, colors.border)}>
            <TabsTrigger value="position" disabled={!!editDayTrade}>Position</TabsTrigger>
            <TabsTrigger value="daytrade" disabled={!!editPosition}>Day Trade</TabsTrigger>
          </TabsList>

          <TabsContent value="position">
            <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="assetType" className={colors.textSecondary}>{t('type')} *</Label>
            <Select value={formData.assetType} onValueChange={(value) => {
              const updates = { assetType: value };
              if (value === 'Cash') {
                updates.symbol = 'CASH';
                updates.averageBuyPrice = '1';
                updates.quantity = '';
              } else if (formData.assetType === 'Cash') {
                updates.symbol = '';
                updates.averageBuyPrice = '';
              }
              setFormData({ ...formData, ...updates });
            }}>
              <SelectTrigger className={cn(colors.bgTertiary, colors.border, colors.textPrimary)}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className={cn(colors.cardBg, colors.cardBorder)}>
                <SelectItem value="Stock" className={colors.textPrimary}>Stock</SelectItem>
                <SelectItem value="ETF" className={colors.textPrimary}>ETF</SelectItem>
                <SelectItem value="Option" className={colors.textPrimary}>Option</SelectItem>
                <SelectItem value="Cash" className={colors.textPrimary}>Cash</SelectItem>
                <SelectItem value="Crypto" className={colors.textPrimary}>Crypto</SelectItem>
                <SelectItem value="Other" className={colors.textPrimary}>Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {formData.assetType !== 'Cash' && (
            <div className="space-y-2">
              <Label htmlFor="symbol" className={colors.textSecondary}>
                {formData.assetType === 'Crypto' ? 'Crypto Symbol' : t('symbol')} *
              </Label>
              <Input
                id="symbol"
                placeholder={formData.assetType === 'Crypto' ? 'e.g., BTC, ETH' : t('symbolPlaceholder')}
                value={formData.symbol}
                onChange={(e) => setFormData({ ...formData, symbol: e.target.value.toUpperCase() })}
                required
                className={cn(colors.bgTertiary, colors.border, colors.textPrimary, "uppercase")}
              />
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="positionDate" className={colors.textSecondary}>{t('date')} *</Label>
              <Input
                id="positionDate"
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                required
                className={cn(colors.bgTertiary, colors.border, colors.textPrimary)}
              />
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

          {formData.assetType === 'Cash' ? (
            <div className="space-y-2">
              <Label htmlFor="quantity" className={colors.textSecondary}>
                {t('depositAmount') || 'Deposit Amount'} *
              </Label>
              <Input
                id="quantity"
                type="number"
                step="0.01"
                placeholder="1000.00"
                value={formData.quantity}
                onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                required
                className={cn(colors.bgTertiary, colors.border, colors.textPrimary)}
              />
              {hasCashPosition && cashBalance > 0 && (
                <p className={cn("text-sm flex items-center gap-1", colors.textTertiary)}>
                  💰 {t('currentCashBalance') || 'Current cash balance'}: <span className="font-medium text-green-400">{new Intl.NumberFormat('en-US', { style: 'currency', currency: accountCurrency }).format(cashBalance)}</span>
                </p>
              )}
              <p className={cn("text-xs", colors.textTertiary)}>
                {t('depositTrackedSeparately') || 'Each deposit is tracked as a separate transaction'}
              </p>
            </div>
          ) : formData.assetType === 'Option' ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="quantity" className={colors.textSecondary}>Contracts *</Label>
                  <Input
                    id="quantity"
                    type="number"
                    step="1"
                    placeholder="1"
                    value={formData.quantity}
                    onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                    required
                    className={cn(colors.bgTertiary, colors.border, colors.textPrimary)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="averageBuyPrice" className={colors.textSecondary}>Contract Avg Price *</Label>
                  <Input
                    id="averageBuyPrice"
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={formData.averageBuyPrice}
                    onChange={(e) => setFormData({ ...formData, averageBuyPrice: e.target.value })}
                    required
                    className={cn(colors.bgTertiary, colors.border, colors.textPrimary)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="strikePrice" className={colors.textSecondary}>Strike Price *</Label>
                  <Input
                    id="strikePrice"
                    type="number"
                    step="0.01"
                    placeholder="150.00"
                    value={formData.strikePrice}
                    onChange={(e) => setFormData({ ...formData, strikePrice: e.target.value })}
                    required
                    className={cn(colors.bgTertiary, colors.border, colors.textPrimary)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="expirationDate" className={colors.textSecondary}>Expiration Date *</Label>
                  <Input
                    id="expirationDate"
                    type="date"
                    value={formData.expirationDate}
                    onChange={(e) => setFormData({ ...formData, expirationDate: e.target.value })}
                    required
                    className={cn(colors.bgTertiary, colors.border, colors.textPrimary)}
                  />
                </div>
              </div>
            </>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="quantity" className={colors.textSecondary}>
                  {formData.assetType === 'Crypto' ? 'Amount' : t('quantity')} *
                </Label>
                <Input
                  id="quantity"
                  type="number"
                  step={formData.assetType === 'Crypto' ? '0.00000001' : '0.01'}
                  placeholder="0"
                  value={formData.quantity}
                  onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                  required
                  className={cn(colors.bgTertiary, colors.border, colors.textPrimary)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="averageBuyPrice" className={colors.textSecondary}>Price per Unit *</Label>
                <Input
                  id="averageBuyPrice"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={formData.averageBuyPrice}
                  onChange={(e) => setFormData({ ...formData, averageBuyPrice: e.target.value })}
                  required
                  className={cn(colors.bgTertiary, colors.border, colors.textPrimary)}
                />
              </div>
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

          {/* Deduct from Cash Option - only show for non-cash positions when cash exists */}
          {!editPosition && formData.assetType !== 'Cash' && cashBalance !== null && (
            <div className={cn("p-3 rounded-lg border", colors.bgTertiary, colors.border)}>
              <div className="flex items-start gap-3">
                <Checkbox
                  id="deductFromCash"
                  checked={deductFromCash}
                  onCheckedChange={setDeductFromCash}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <Label htmlFor="deductFromCash" className={cn("font-medium cursor-pointer", colors.textPrimary)}>
                    {t('deductFromCash') || 'Deduct from cash balance'}
                  </Label>
                  <div className={cn("text-sm mt-1", colors.textTertiary)}>
                    <div className="flex justify-between">
                      <span>{t('availableCash') || 'Available cash'}:</span>
                      <span className={cn("font-medium", cashBalance > 0 ? 'text-green-400' : colors.textPrimary)}>
                        {new Intl.NumberFormat('en-US', { style: 'currency', currency: accountCurrency }).format(cashBalance)}
                      </span>
                    </div>
                    {purchaseCost > 0 && (
                      <>
                        <div className="flex justify-between">
                          <span>{t('purchaseCost') || 'Purchase cost'}:</span>
                          <span className="font-medium text-amber-400">
                            -{new Intl.NumberFormat('en-US', { style: 'currency', currency: accountCurrency }).format(purchaseCost)}
                          </span>
                        </div>
                        <div className={cn("flex justify-between pt-1 border-t mt-1", colors.borderLight)}>
                          <span>{t('remainingCash') || 'Remaining'}:</span>
                          <span className={cn("font-medium", hasSufficientCash ? 'text-green-400' : 'text-red-400')}>
                            {new Intl.NumberFormat('en-US', { style: 'currency', currency: accountCurrency }).format(cashBalance - purchaseCost)}
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                  {deductFromCash && !hasSufficientCash && purchaseCost > 0 && (
                    <p className="text-red-400 text-sm mt-2">
                      ⚠️ {t('insufficientCash') || 'Insufficient cash for this purchase'}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

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
                      {editPosition ? t('updating') : t('adding')}
                    </>
                  ) : (
                    editPosition ? t('updatePositionBtn') : t('addPositionBtn')
                  )}
                </Button>
              </div>
            </form>
          </TabsContent>

          <TabsContent value="daytrade">
            <form onSubmit={handleDayTradeSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="date" className={colors.textSecondary}>Date *</Label>
                  <Input
                    id="date"
                    type="date"
                    value={dayTradeData.date}
                    onChange={(e) => setDayTradeData({ ...dayTradeData, date: e.target.value })}
                    required
                    className={cn(colors.bgTertiary, colors.border, colors.textPrimary)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="profitLoss" className={colors.textSecondary}>
                    Profit/Loss ({accountCurrency}) *
                  </Label>
                  <Input
                    id="profitLoss"
                    type="number"
                    step="0.01"
                    placeholder="150.00"
                    value={dayTradeData.profitLoss}
                    onChange={(e) => setDayTradeData({ ...dayTradeData, profitLoss: e.target.value })}
                    required
                    className={cn(colors.bgTertiary, colors.border, colors.textPrimary)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="dayTradeNotes" className={colors.textSecondary}>{t('notesOptional')}</Label>
                <Textarea
                  id="dayTradeNotes"
                  placeholder="Day trading strategy, trades executed, etc."
                  value={dayTradeData.notes}
                  onChange={(e) => setDayTradeData({ ...dayTradeData, notes: e.target.value })}
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
                      {t('saving')}
                    </>
                  ) : (
                    editDayTrade ? 'Update Trade' : 'Add Trade'
                  )}
                </Button>
              </div>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}