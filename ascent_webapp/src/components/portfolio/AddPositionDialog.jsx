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
  const { colors, t, user } = useTheme();
  const [activeTab, setActiveTab] = useState('position');
  const [deductFromCash, setDeductFromCash] = useState(true);
  
  // Ensure we have a valid currency code
  const currency = accountCurrency || user?.currency || 'USD';
  
  // Format currency helper function
  const formatCurrency = (value, currencyCode = currency) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value || 0);
  };
  
  const [formData, setFormData] = useState(editPosition || {
    symbol: '',
    assetType: 'Stock',
    quantity: '',
    averageBuyPrice: '',
    currency: currency,
    date: new Date().toISOString().split('T')[0],
    strikePrice: '',
    expirationDate: '',
    optionType: 'Call',
    optionAction: 'Buy',
    premiumPrice: '',
    stockPriceAtPurchase: '',
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
        currency: currency,
        date: new Date().toISOString().split('T')[0],
        strikePrice: '',
        expirationDate: '',
        optionType: 'Call',
        optionAction: 'Buy',
        premiumPrice: '',
        stockPriceAtPurchase: '',
        notes: '',
      });
      setDayTradeData({
        date: new Date().toISOString().split('T')[0],
        profitLoss: '',
        notes: '',
      });
      setActiveTab('position');
    }
  }, [editPosition, editDayTrade, accountCurrency, user?.currency, open]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validate Option-specific fields
    if (formData.assetType === 'Option') {
      if (!formData.strikePrice || parseFloat(formData.strikePrice) <= 0) {
        alert('Please enter a valid strike price for the option.');
        return;
      }
      if (!formData.expirationDate) {
        alert('Please select an expiration date for the option.');
        return;
      }
      if (!formData.optionType || !['Call', 'Put'].includes(formData.optionType)) {
        alert('Please select option type (Call or Put).');
        return;
      }
      if (!formData.optionAction || !['Buy', 'Sell'].includes(formData.optionAction)) {
        alert('Please select option action (Buy or Sell).');
        return;
      }
      if (!formData.premiumPrice || parseFloat(formData.premiumPrice) <= 0) {
        alert('Please enter a valid premium price for the option.');
        return;
      }
      if (!formData.stockPriceAtPurchase || parseFloat(formData.stockPriceAtPurchase) <= 0) {
        alert('Please enter the stock price at purchase.');
        return;
      }
    }
    
    const submitData = {
      ...formData,
      symbol: formData.symbol ? formData.symbol.toUpperCase() : '',
      quantity: parseFloat(formData.quantity) || 0,
      averageBuyPrice: parseFloat(formData.averageBuyPrice) || 0,
    };

    if (formData.assetType === 'Option') {
      submitData.strikePrice = parseFloat(formData.strikePrice) || 0;
      submitData.expirationDate = formData.expirationDate || '';
      submitData.optionType = formData.optionType || 'Call';
      submitData.optionAction = formData.optionAction || 'Buy';
      submitData.premiumPrice = parseFloat(formData.premiumPrice) || 0;
      submitData.stockPriceAtPurchase = parseFloat(formData.stockPriceAtPurchase) || 0;
      // For options, averageBuyPrice should be the premium price
      submitData.averageBuyPrice = submitData.premiumPrice;
    } else {
      // Remove Option-specific fields for non-Option asset types
      delete submitData.strikePrice;
      delete submitData.expirationDate;
      delete submitData.optionType;
      delete submitData.optionAction;
      delete submitData.premiumPrice;
      delete submitData.stockPriceAtPurchase;
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
      <DialogContent className={cn(colors.cardBg, colors.cardBorder, "w-[95vw] max-w-[95vw] sm:w-full sm:max-w-md max-h-[90vh] overflow-y-auto p-3 sm:p-6")}>
        <DialogHeader className="pb-2 sm:pb-4">
          <DialogTitle className={cn("text-base sm:text-xl font-bold", colors.accentText)}>
            {editPosition ? t('editPosition') : editDayTrade ? 'Edit Day Trade' : 'Add to Portfolio'}
          </DialogTitle>
          <DialogDescription className={cn("text-[10px] sm:text-sm hidden sm:block", colors.textTertiary)}>
            {editPosition ? t('updatePositionDetails') : editDayTrade ? 'Update your day trade record' : 'Add a position or record day trading P&L'}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-2 sm:mt-4">
          <TabsList className={cn("grid w-full grid-cols-2 mb-2 sm:mb-4 h-8 sm:h-10", colors.bgTertiary, colors.border)}>
            <TabsTrigger value="position" disabled={!!editDayTrade} className="text-xs sm:text-sm">Position</TabsTrigger>
            <TabsTrigger value="daytrade" disabled={!!editPosition} className="text-xs sm:text-sm">Day Trade</TabsTrigger>
          </TabsList>

          <TabsContent value="position">
            <form onSubmit={handleSubmit} className="space-y-2 sm:space-y-4">
          <div className={cn("grid gap-2 sm:gap-4", formData.assetType === 'Cash' ? "grid-cols-1" : "grid-cols-2")}>
            <div className="space-y-1 sm:space-y-2">
              <Label htmlFor="assetType" className={cn("text-[10px] sm:text-sm", colors.textSecondary)}>{t('type')} *</Label>
              <Select value={formData.assetType} onValueChange={(value) => {
                const updates = { assetType: value };
                if (value === 'Cash') {
                  updates.symbol = 'CASH';
                  updates.averageBuyPrice = '1';
                  updates.quantity = '';
                  updates.strikePrice = '';
                  updates.expirationDate = '';
                } else if (formData.assetType === 'Cash') {
                  updates.symbol = '';
                  updates.averageBuyPrice = '';
                }
                // Clear Option-specific fields when switching away from Option
                if (formData.assetType === 'Option' && value !== 'Option') {
                  updates.strikePrice = '';
                  updates.expirationDate = '';
                  updates.optionType = 'Call';
                  updates.optionAction = 'Buy';
                  updates.premiumPrice = '';
                  updates.stockPriceAtPurchase = '';
                }
                // Initialize Option fields when switching to Option
                if (value === 'Option' && formData.assetType !== 'Option') {
                  updates.optionType = updates.optionType || 'Call';
                  updates.optionAction = updates.optionAction || 'Buy';
                  updates.premiumPrice = updates.premiumPrice || '';
                  updates.stockPriceAtPurchase = updates.stockPriceAtPurchase || '';
                }
                setFormData({ ...formData, ...updates });
              }}>
                <SelectTrigger className={cn("h-8 sm:h-10 text-xs sm:text-sm", colors.bgTertiary, colors.border, colors.textPrimary)}>
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
              <div className="space-y-1 sm:space-y-2">
                <Label htmlFor="symbol" className={cn("text-[10px] sm:text-sm", colors.textSecondary)}>
                  {formData.assetType === 'Crypto' ? 'Crypto Symbol' : t('symbol')} *
                </Label>
                <Input
                  id="symbol"
                  placeholder={formData.assetType === 'Crypto' ? 'e.g., BTC, ETH' : t('symbolPlaceholder')}
                  value={formData.symbol}
                  onChange={(e) => setFormData({ ...formData, symbol: e.target.value.toUpperCase() })}
                  required
                  className={cn("h-8 sm:h-10 text-xs sm:text-sm", colors.bgTertiary, colors.border, colors.textPrimary, "uppercase")}
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 sm:gap-4">
            <div className="space-y-1 sm:space-y-2">
              <Label htmlFor="positionDate" className={cn("text-[10px] sm:text-sm", colors.textSecondary)}>{t('date')} *</Label>
              <Input
                id="positionDate"
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                required
                className={cn("h-8 sm:h-10 text-xs sm:text-sm", colors.bgTertiary, colors.border, colors.textPrimary)}
              />
            </div>

            <div className="space-y-1 sm:space-y-2">
              <Label htmlFor="currency" className={cn("text-[10px] sm:text-sm", colors.textSecondary)}>{t('currency')} *</Label>
              <Select value={formData.currency} onValueChange={(value) => setFormData({ ...formData, currency: value })}>
                <SelectTrigger className={cn("h-8 sm:h-10 text-xs sm:text-sm", colors.bgTertiary, colors.border, colors.textPrimary)}>
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
            <div className="space-y-1 sm:space-y-2">
              <Label htmlFor="quantity" className={cn("text-[10px] sm:text-sm", colors.textSecondary)}>
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
                className={cn("h-8 sm:h-10 text-xs sm:text-sm", colors.bgTertiary, colors.border, colors.textPrimary)}
              />
              {hasCashPosition && cashBalance > 0 && (
                <p className={cn("text-sm flex items-center gap-1", colors.textTertiary)}>
                  💰 {t('currentCashBalance') || 'Current cash balance'}: <span className="font-medium text-green-400">{formatCurrency(cashBalance, currency)}</span>
                </p>
              )}
              <p className={cn("text-xs", colors.textTertiary)}>
                {t('depositTrackedSeparately') || 'Each deposit is tracked as a separate transaction'}
              </p>
            </div>
          ) : formData.assetType === 'Option' ? (
            <>
              <div className="grid grid-cols-2 gap-2 sm:gap-4">
                <div className="space-y-1 sm:space-y-2">
                  <Label htmlFor="optionType" className={cn("text-[10px] sm:text-sm", colors.textSecondary)}>Option Type *</Label>
                  <Select 
                    value={formData.optionType || 'Call'} 
                    onValueChange={(value) => setFormData({ ...formData, optionType: value })}
                  >
                    <SelectTrigger className={cn("h-8 sm:h-10 text-xs sm:text-sm", colors.bgTertiary, colors.border, colors.textPrimary)}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className={cn(colors.cardBg, colors.cardBorder)}>
                      <SelectItem value="Call" className={colors.textPrimary}>Call</SelectItem>
                      <SelectItem value="Put" className={colors.textPrimary}>Put</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1 sm:space-y-2">
                  <Label htmlFor="optionAction" className={cn("text-[10px] sm:text-sm", colors.textSecondary)}>Action *</Label>
                  <Select 
                    value={formData.optionAction || 'Buy'} 
                    onValueChange={(value) => setFormData({ ...formData, optionAction: value })}
                  >
                    <SelectTrigger className={cn("h-8 sm:h-10 text-xs sm:text-sm", colors.bgTertiary, colors.border, colors.textPrimary)}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className={cn(colors.cardBg, colors.cardBorder)}>
                      <SelectItem value="Buy" className={colors.textPrimary}>Buy</SelectItem>
                      <SelectItem value="Sell" className={colors.textPrimary}>Sell</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:gap-4">
                <div className="space-y-1 sm:space-y-2">
                  <Label htmlFor="quantity" className={cn("text-[10px] sm:text-sm", colors.textSecondary)}>Contracts *</Label>
                  <Input
                    id="quantity"
                    type="number"
                    step="1"
                    placeholder="1"
                    value={formData.quantity}
                    onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                    required
                    className={cn("h-8 sm:h-10 text-xs sm:text-sm", colors.bgTertiary, colors.border, colors.textPrimary)}
                  />
                </div>

                <div className="space-y-1 sm:space-y-2">
                  <Label htmlFor="premiumPrice" className={cn("text-[10px] sm:text-sm", colors.textSecondary)}>Premium per Contract *</Label>
                  <Input
                    id="premiumPrice"
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={formData.premiumPrice}
                    onChange={(e) => setFormData({ ...formData, premiumPrice: e.target.value })}
                    required
                    className={cn("h-8 sm:h-10 text-xs sm:text-sm", colors.bgTertiary, colors.border, colors.textPrimary)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:gap-4">
                <div className="space-y-1 sm:space-y-2">
                  <Label htmlFor="strikePrice" className={cn("text-[10px] sm:text-sm", colors.textSecondary)}>Strike Price *</Label>
                  <Input
                    id="strikePrice"
                    type="number"
                    step="0.01"
                    placeholder="150.00"
                    value={formData.strikePrice}
                    onChange={(e) => setFormData({ ...formData, strikePrice: e.target.value })}
                    required
                    className={cn("h-8 sm:h-10 text-xs sm:text-sm", colors.bgTertiary, colors.border, colors.textPrimary)}
                  />
                </div>

                <div className="space-y-1 sm:space-y-2">
                  <Label htmlFor="stockPriceAtPurchase" className={cn("text-[10px] sm:text-sm", colors.textSecondary)}>Stock Price at Purchase *</Label>
                  <Input
                    id="stockPriceAtPurchase"
                    type="number"
                    step="0.01"
                    placeholder="150.00"
                    value={formData.stockPriceAtPurchase}
                    onChange={(e) => setFormData({ ...formData, stockPriceAtPurchase: e.target.value })}
                    required
                    className={cn("h-8 sm:h-10 text-xs sm:text-sm", colors.bgTertiary, colors.border, colors.textPrimary)}
                  />
                </div>
              </div>

              <div className="space-y-1 sm:space-y-2">
                <Label htmlFor="expirationDate" className={cn("text-[10px] sm:text-sm", colors.textSecondary)}>Expiration Date *</Label>
                <Input
                  id="expirationDate"
                  type="date"
                  value={formData.expirationDate}
                  onChange={(e) => setFormData({ ...formData, expirationDate: e.target.value })}
                  required
                  className={cn("h-8 sm:h-10 text-xs sm:text-sm", colors.bgTertiary, colors.border, colors.textPrimary)}
                />
              </div>

              {formData.quantity && formData.premiumPrice && (
                <div className={cn("p-2 rounded-lg border text-xs", colors.bgTertiary, colors.border)}>
                  <p className={cn(colors.textSecondary)}>
                    Total Premium: <span className="font-semibold text-amber-400">
                      {new Intl.NumberFormat('en-US', { 
                        style: 'currency', 
                        currency: currency 
                      }).format((parseFloat(formData.quantity) || 0) * (parseFloat(formData.premiumPrice) || 0) * 100)}
                    </span>
                    <span className={cn("ml-1", colors.textTertiary)}>
                      ({formData.quantity} contracts × {formData.premiumPrice} × 100)
                    </span>
                  </p>
                </div>
              )}
            </>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:gap-4">
              <div className="space-y-1 sm:space-y-2">
                <Label htmlFor="quantity" className={cn("text-[10px] sm:text-sm", colors.textSecondary)}>
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
                  className={cn("h-8 sm:h-10 text-xs sm:text-sm", colors.bgTertiary, colors.border, colors.textPrimary)}
                />
              </div>

              <div className="space-y-1 sm:space-y-2">
                <Label htmlFor="averageBuyPrice" className={cn("text-[10px] sm:text-sm", colors.textSecondary)}>Price per Unit *</Label>
                <Input
                  id="averageBuyPrice"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={formData.averageBuyPrice}
                  onChange={(e) => setFormData({ ...formData, averageBuyPrice: e.target.value })}
                  required
                  className={cn("h-8 sm:h-10 text-xs sm:text-sm", colors.bgTertiary, colors.border, colors.textPrimary)}
                />
              </div>
            </div>
          )}

          <div className="space-y-1 sm:space-y-2">
            <Label htmlFor="notes" className={cn("text-[10px] sm:text-sm", colors.textSecondary)}>{t('notesOptional')}</Label>
            <Textarea
              id="notes"
              placeholder={t('notesPlaceholder')}
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className={cn("text-xs sm:text-sm min-h-[60px] sm:min-h-[80px]", colors.bgTertiary, colors.border, colors.textPrimary)}
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
                        {formatCurrency(cashBalance, currency)}
                      </span>
                    </div>
                    {purchaseCost > 0 && (
                      <>
                        <div className="flex justify-between">
                          <span>{t('purchaseCost') || 'Purchase cost'}:</span>
                          <span className="font-medium text-amber-400">
                            -{formatCurrency(purchaseCost, currency)}
                          </span>
                        </div>
                        <div className={cn("flex justify-between pt-1 border-t mt-1", colors.borderLight)}>
                          <span>{t('remainingCash') || 'Remaining'}:</span>
                          <span className={cn("font-medium", hasSufficientCash ? 'text-green-400' : 'text-red-400')}>
                            {formatCurrency(cashBalance - purchaseCost, currency)}
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

              <div className="flex gap-2 sm:gap-3 pt-2 sm:pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClose}
                  disabled={isLoading}
                  className={cn("flex-1 h-8 sm:h-10 text-xs sm:text-base bg-transparent hover:bg-[#5C8374]/20", colors.border, colors.textSecondary)}
                >
                  {t('cancel')}
                </Button>
                <Button
                  type="submit"
                  disabled={isLoading}
                  className="flex-1 h-8 sm:h-10 text-xs sm:text-base bg-[#5C8374] hover:bg-[#5C8374]/80 text-white"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2 animate-spin" />
                      <span className="hidden sm:inline">{editPosition ? t('updating') : t('adding')}</span>
                    </>
                  ) : (
                    editPosition ? t('updatePositionBtn') : t('addPositionBtn')
                  )}
                </Button>
              </div>
            </form>
          </TabsContent>

          <TabsContent value="daytrade">
            <form onSubmit={handleDayTradeSubmit} className="space-y-2 sm:space-y-4">
              <div className="grid grid-cols-2 gap-2 sm:gap-4">
                <div className="space-y-1 sm:space-y-2">
                  <Label htmlFor="date" className={cn("text-[10px] sm:text-sm", colors.textSecondary)}>Date *</Label>
                  <Input
                    id="date"
                    type="date"
                    value={dayTradeData.date}
                    onChange={(e) => setDayTradeData({ ...dayTradeData, date: e.target.value })}
                    required
                    className={cn("h-8 sm:h-10 text-xs sm:text-sm", colors.bgTertiary, colors.border, colors.textPrimary)}
                  />
                </div>

                <div className="space-y-1 sm:space-y-2">
                  <Label htmlFor="profitLoss" className={cn("text-[10px] sm:text-sm", colors.textSecondary)}>
                    Profit/Loss ({currency}) *
                  </Label>
                  <Input
                    id="profitLoss"
                    type="number"
                    step="0.01"
                    placeholder="150.00"
                    value={dayTradeData.profitLoss}
                    onChange={(e) => setDayTradeData({ ...dayTradeData, profitLoss: e.target.value })}
                    required
                    className={cn("h-8 sm:h-10 text-xs sm:text-sm", colors.bgTertiary, colors.border, colors.textPrimary)}
                  />
                </div>
              </div>

              <div className="space-y-1 sm:space-y-2">
                <Label htmlFor="dayTradeNotes" className={cn("text-[10px] sm:text-sm", colors.textSecondary)}>{t('notesOptional')}</Label>
                <Textarea
                  id="dayTradeNotes"
                  placeholder="Day trading strategy, trades executed, etc."
                  value={dayTradeData.notes}
                  onChange={(e) => setDayTradeData({ ...dayTradeData, notes: e.target.value })}
                  className={cn("text-xs sm:text-sm min-h-[60px] sm:min-h-[80px]", colors.bgTertiary, colors.border, colors.textPrimary)}
                />
              </div>

              <div className="flex gap-2 sm:gap-3 pt-2 sm:pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClose}
                  disabled={isLoading}
                  className={cn("flex-1 h-8 sm:h-10 text-xs sm:text-base bg-transparent hover:bg-[#5C8374]/20", colors.border, colors.textSecondary)}
                >
                  {t('cancel')}
                </Button>
                <Button
                  type="submit"
                  disabled={isLoading}
                  className="flex-1 h-8 sm:h-10 text-xs sm:text-base bg-[#5C8374] hover:bg-[#5C8374]/80 text-white"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2 animate-spin" />
                      <span className="hidden sm:inline">{t('saving')}</span>
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