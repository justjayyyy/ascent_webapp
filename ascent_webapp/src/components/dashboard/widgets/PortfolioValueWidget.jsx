import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useTheme } from '../../ThemeProvider';
import { cn } from '@/lib/utils';
import TimeRangeSelector from '../../TimeRangeSelector';

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

export default function PortfolioValueWidget({ data, formatCurrency, timeRange, onTimeRangeChange }) {
  const { colors, theme, user, t } = useTheme();
  
  const chartColors = {
    text: theme === 'light' ? '#1e293b' : '#ffffff',
    grid: theme === 'light' ? '#e2e8f0' : '#5C8374',
    tooltip: theme === 'light' ? '#ffffff' : '#1B4242',
    tooltipBorder: theme === 'light' ? '#e2e8f0' : '#5C8374',
    tooltipText: theme === 'light' ? '#1e293b' : '#ffffff',
  };
  
  return (
    <Card className={cn(colors.cardBg, colors.cardBorder, "h-full flex flex-col")}>
      <CardHeader className="widget-drag-handle cursor-move pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className={colors.accentText}>{t('portfolioValue') || 'Portfolio Value'}</CardTitle>
          <TimeRangeSelector value={timeRange} onChange={onTimeRangeChange} />
        </div>
      </CardHeader>
      <CardContent className="flex-1 pt-0">
        <ResponsiveContainer width="100%" height="100%" minHeight={200}>
          <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} opacity={0.3} />
            <XAxis 
              dataKey="date" 
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
              width={50}
              orientation="left"
            />
            <Tooltip
              contentStyle={{
                backgroundColor: chartColors.tooltip,
                border: `1px solid ${chartColors.tooltipBorder}`,
                borderRadius: '8px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              }}
              itemStyle={{ color: chartColors.tooltipText }}
              labelStyle={{ color: chartColors.tooltipText, fontWeight: 600 }}
              formatter={(value) => [user?.blurValues ? '••••••' : formatCurrency(value, user?.currency), t('value') || 'Value']}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke="#5C8374"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 5, fill: '#9EC8B9', stroke: '#5C8374', strokeWidth: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}