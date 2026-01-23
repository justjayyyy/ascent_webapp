import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { 
  LineChart as LineChartIcon, 
  PieChart, 
  BarChart3, 
  Target,
  Percent,
  TrendingUp,
  Wallet,
  Loader2
} from 'lucide-react';
import { useTheme } from '../ThemeProvider';
import { cn } from '@/lib/utils';

const AVAILABLE_WIDGETS = [
  {
    type: 'portfolio_value',
    name: 'Portfolio Value Trend',
    description: 'Historical portfolio performance',
    icon: LineChartIcon,
    defaultSize: 'large',
  },
  {
    type: 'net_worth',
    name: 'Net Worth Chart',
    description: 'Assets minus cumulative expenses',
    icon: TrendingUp,
    defaultSize: 'large',
  },
  {
    type: 'account_allocation',
    name: 'Account Allocation',
    description: 'Breakdown by account type',
    icon: PieChart,
    defaultSize: 'medium',
  },
  {
    type: 'asset_allocation',
    name: 'Asset Allocation',
    description: 'Distribution by asset type',
    icon: BarChart3,
    defaultSize: 'full',
  },
  {
    type: 'account_summary',
    name: 'Account Summary',
    description: 'List of all accounts',
    icon: Wallet,
    defaultSize: 'full',
  },
  {
    type: 'savings_rate',
    name: 'Savings Rate',
    description: 'Monthly savings percentage',
    icon: Percent,
    defaultSize: 'small',
  },
  {
    type: 'benchmark_comparison',
    name: 'Benchmark Comparison',
    description: 'Performance vs S&P 500',
    icon: TrendingUp,
    defaultSize: 'full',
  },
  {
    type: 'financial_goals',
    name: 'Financial Goals',
    description: 'Track your financial objectives',
    icon: Target,
    defaultSize: 'full',
  },
];

export default function DashboardCustomization({ open, onClose, widgets, onSave, isSaving }) {
  const { colors, t } = useTheme();
  const [localWidgets, setLocalWidgets] = useState(widgets);

  React.useEffect(() => {
    setLocalWidgets(widgets);
  }, [widgets, open]);

  const toggleWidget = (widgetType) => {
    const existing = localWidgets.find(w => w.widgetType === widgetType);
    
    if (existing) {
      setLocalWidgets(localWidgets.map(w => 
        w.widgetType === widgetType ? { ...w, enabled: !w.enabled } : w
      ));
    } else {
      const maxY = localWidgets.length > 0 
        ? Math.max(...localWidgets.filter(w => w && typeof w.y !== 'undefined' && typeof w.h !== 'undefined').map(w => (w.y || 0) + (w.h || 1)), 0)
        : 0;
      setLocalWidgets([
        ...localWidgets,
        {
          widgetType,
          x: 0,
          y: maxY,
          w: 2,
          h: 3,
          enabled: true,
        }
      ]);
    }
  };

  const isWidgetEnabled = (widgetType) => {
    const widget = localWidgets.find(w => w.widgetType === widgetType);
    return widget?.enabled || false;
  };

  const handleSave = () => {
    onSave(localWidgets);
  };

  const handleResetToDefault = () => {
    const defaultWidgets = [
      { widgetType: 'net_worth', x: 0, y: 0, w: 2, h: 3, enabled: true },
      { widgetType: 'account_allocation', x: 0, y: 3, w: 1, h: 3, enabled: true },
      { widgetType: 'asset_allocation', x: 1, y: 3, w: 1, h: 3, enabled: true },
      { widgetType: 'benchmark_comparison', x: 0, y: 6, w: 2, h: 2, enabled: true },
      { widgetType: 'financial_goals', x: 0, y: 8, w: 2, h: 3, enabled: true },
      { widgetType: 'account_summary', x: 0, y: 11, w: 2, h: 3, enabled: true },
    ];
    setLocalWidgets(defaultWidgets);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className={cn(colors.cardBg, colors.cardBorder, "max-w-2xl max-h-[80vh] overflow-y-auto")}>
        <DialogHeader>
          <DialogTitle className={cn("text-xl font-bold", colors.accentText)}>
            {t('customizeDashboard')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          <div className="space-y-3">
            {AVAILABLE_WIDGETS.map((widget) => {
              const Icon = widget.icon;
              const enabled = isWidgetEnabled(widget.type);
              
              return (
                <Card
                  key={widget.type}
                  className={cn(
                    "p-4 border transition-all",
                    enabled ? cn(colors.bgTertiary, colors.border) : cn(colors.bgTertiary, colors.borderLight, "opacity-60")
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1">
                      <div className={cn(
                        "p-2 rounded-lg",
                        enabled ? 'bg-[#5C8374]/20' : 'bg-[#5C8374]/10'
                      )}>
                        <Icon className={cn(
                          "w-5 h-5",
                          enabled ? colors.accentText : cn(colors.accentText, "opacity-50")
                        )} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className={cn(
                          "font-semibold",
                          enabled ? colors.textPrimary : cn(colors.textPrimary, "opacity-50")
                        )}>
                          {widget.name}
                        </h3>
                        <p className={cn("text-xs", colors.textTertiary)}>
                          {widget.description}
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={enabled}
                      onCheckedChange={() => toggleWidget(widget.type)}
                      className="data-[state=checked]:bg-[#5C8374]"
                    />
                  </div>
                </Card>
              );
            })}
          </div>

          <div className={cn("flex gap-3 pt-4 border-t", colors.borderLight)}>
            <Button
              onClick={handleResetToDefault}
              variant="outline"
              disabled={isSaving}
              className={cn("flex-1 bg-transparent hover:bg-[#5C8374]/20", colors.border, colors.textSecondary)}
            >
              {t('resetToDefault')}
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving}
              className="flex-1 bg-[#5C8374] hover:bg-[#5C8374]/80 text-white"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {t('saving')}
                </>
              ) : (
                t('saveLayout')
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}