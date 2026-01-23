import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { useTheme } from '../../ThemeProvider';
import { cn } from '@/lib/utils';

// High contrast bar colors
const BAR_COLORS = ['#22C55E', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6'];

// Format large numbers for Y-axis with currency symbol
const formatYAxisValue = (value, currency = 'USD') => {
  const symbols = { USD: '$', EUR: '€', GBP: '£', ILS: '₪', RUB: '₽' };
  const symbol = symbols[currency] || '$';
  
  if (value >= 1000000) {
    return `${symbol}${(value / 1000000).toFixed(1)}M`;
  } else if (value >= 1000) {
    return `${symbol}${(value / 1000).toFixed(0)}K`;
  }
  return `${symbol}${value}`;
};

export default function AssetAllocationWidget({ data, formatCurrency }) {
  const { colors, theme, user, t } = useTheme();
  
  const chartColors = {
    text: theme === 'light' ? '#1e293b' : '#ffffff',
    grid: theme === 'light' ? '#e2e8f0' : '#5C8374',
    tooltip: theme === 'light' ? '#ffffff' : '#1B4242',
    tooltipBorder: theme === 'light' ? '#e2e8f0' : '#5C8374',
    tooltipText: theme === 'light' ? '#1e293b' : '#ffffff',
  };

  // Custom tooltip with proper text color
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div 
          style={{ 
            backgroundColor: chartColors.tooltip, 
            border: `1px solid ${chartColors.tooltipBorder}`,
            borderRadius: '8px',
            padding: '10px 14px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
          }}
        >
          <p style={{ color: chartColors.tooltipText, fontWeight: 600, marginBottom: '4px' }}>
            {label}
          </p>
          <p style={{ color: chartColors.tooltipText, fontSize: '14px' }}>
            {user?.blurValues ? '••••••' : formatCurrency(payload[0].value, user?.currency)}
          </p>
        </div>
      );
    }
    return null;
  };

  const hasData = data && data.length > 0;
  
  return (
    <Card className={cn(colors.cardBg, colors.cardBorder, "h-full flex flex-col")}>
      <CardHeader className="widget-drag-handle cursor-move pb-2">
        <CardTitle className={colors.accentText}>{t('assetAllocation')}</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden pt-0">
        {hasData ? (
          <ResponsiveContainer width="100%" height="100%" minHeight={180}>
            <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} opacity={0.3} />
              <XAxis 
                dataKey="name" 
                stroke={chartColors.text} 
                style={{ fontSize: '10px' }}
                tick={{ fill: chartColors.text }}
                tickLine={{ stroke: chartColors.text }}
                axisLine={{ stroke: chartColors.grid }}
              />
              <YAxis 
                stroke={chartColors.text} 
                style={{ fontSize: '10px' }}
                tick={{ fill: chartColors.text }}
                tickLine={{ stroke: chartColors.text }}
                axisLine={{ stroke: chartColors.grid }}
                tickFormatter={(value) => user?.blurValues ? '•••' : formatYAxisValue(value, user?.currency)}
                width={45}
                orientation="left"
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={BAR_COLORS[index % BAR_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className={cn("flex items-center justify-center h-full min-h-[120px]", colors.textTertiary)}>
            {t('noPositionsYet') || 'No positions yet'}
          </div>
        )}
      </CardContent>
    </Card>
  );
}