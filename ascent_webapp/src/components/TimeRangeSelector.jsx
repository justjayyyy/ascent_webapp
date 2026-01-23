import React from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useTheme } from './ThemeProvider';

export default function TimeRangeSelector({ value, onChange, options = ['7d', '30d', '90d', '1y', 'all'] }) {
  const { colors } = useTheme();

  const rangeLabels = {
    '7d': '7D',
    '30d': '30D',
    '90d': '90D',
    '1y': '1Y',
    'all': 'All',
  };

  return (
    <div className="flex gap-1">
      {options.map((range) => (
        <Button
          key={range}
          onClick={() => onChange(range)}
          variant="ghost"
          size="sm"
          className={cn(
            "h-7 px-2 text-xs",
            value === range
              ? "bg-[#5C8374] text-white hover:bg-[#5C8374]/80"
              : cn(colors.textTertiary, "hover:bg-[#5C8374]/20")
          )}
        >
          {rangeLabels[range] || range}
        </Button>
      ))}
    </div>
  );
}