import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { useTheme } from '../../ThemeProvider';
import { cn } from '@/lib/utils';
import BlurValue from '../../BlurValue';

// High contrast colors for better visibility
const COLORS = ['#22C55E', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6'];

export default function AccountAllocationWidget({ data, totalValue, formatCurrency }) {
  const { colors, theme, user, t } = useTheme();
  
  const chartColors = {
    tooltip: theme === 'light' ? '#ffffff' : '#1B4242',
    tooltipBorder: theme === 'light' ? '#e2e8f0' : '#5C8374',
    tooltipText: theme === 'light' ? '#1e293b' : '#ffffff',
    labelText: theme === 'light' ? '#1e293b' : '#ffffff',
    legendText: theme === 'light' ? '#475569' : '#9EC8B9',
  };

  // Custom label that renders outside the pie with good contrast
  const renderCustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, name }) => {
    const RADIAN = Math.PI / 180;
    const radius = outerRadius * 1.2;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);
    
    if (percent < 0.05) return null; // Hide labels for very small slices
    
    return (
      <text
        x={x}
        y={y}
        fill={chartColors.labelText}
        textAnchor={x > cx ? 'start' : 'end'}
        dominantBaseline="central"
        style={{ fontSize: '12px', fontWeight: 500 }}
      >
        {`${name} ${(percent * 100).toFixed(1)}%`}
      </text>
    );
  };

  // Custom tooltip with proper text color
  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const item = payload[0];
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
            {item.name}
          </p>
          <p style={{ color: chartColors.tooltipText, fontSize: '14px' }}>
            {user?.blurValues ? '••••••' : formatCurrency(item.value, user?.currency)}
          </p>
          <p style={{ color: chartColors.legendText, fontSize: '12px' }}>
            {((item.value / totalValue) * 100).toFixed(1)}% of total
          </p>
        </div>
      );
    }
    return null;
  };

  // Calculate dynamic height based on data
  const hasData = data && data.length > 0;
  const chartHeight = hasData ? Math.max(200, Math.min(300, 200 + data.length * 20)) : 150;
  
  return (
    <Card className={cn(colors.cardBg, colors.cardBorder, "h-full flex flex-col")}>
      <CardHeader className="widget-drag-handle cursor-move pb-2">
        <CardTitle className={colors.accentText}>{t('allocationByAccountType')}</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden">
        {hasData ? (
          <div className="h-full flex flex-col">
            <ResponsiveContainer width="100%" height={chartHeight}>
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  labelLine={true}
                  label={renderCustomLabel}
                  outerRadius={70}
                  innerRadius={30}
                  fill="#8884d8"
                  dataKey="value"
                  paddingAngle={2}
                >
                  {data.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={COLORS[index % COLORS.length]}
                      stroke={theme === 'light' ? '#ffffff' : '#092635'}
                      strokeWidth={2}
                    />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            {/* Legend with scrolling for many items */}
            <div className="mt-2 max-h-24 overflow-y-auto custom-scrollbar">
              <div className="flex flex-wrap gap-2 justify-center">
                {data.map((entry, index) => (
                  <div key={entry.name} className="flex items-center gap-1.5 text-xs">
                    <div 
                      className="w-3 h-3 rounded-full flex-shrink-0" 
                      style={{ backgroundColor: COLORS[index % COLORS.length] }}
                    />
                    <span className={colors.textSecondary}>{entry.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className={cn("flex items-center justify-center h-full min-h-[120px]", colors.textTertiary)}>
            {t('noDataAvailable') || 'No data available'}
          </div>
        )}
      </CardContent>
    </Card>
  );
}