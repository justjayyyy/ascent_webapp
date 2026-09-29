import React, { useMemo } from 'react';
import EChart, { useChartTokens } from './EChart';

/**
 * Animated ECharts donut with an optional centre label.
 * data: [{ name, value, color? }]; colors fall back to the theme chart palette.
 */
export default function DonutChart({ data, centerLabel, centerSub, formatValue, blur = false, height = 200, ariaLabel }) {
  const tokens = useChartTokens();

  const option = useMemo(() => {
    if (!tokens) return null;
    const palette = [...tokens.series, tokens.muted, tokens.primary];
    return {
      animationDuration: 900,
      animationEasing: 'cubicOut',
      tooltip: blur ? { show: false } : {
        trigger: 'item',
        backgroundColor: tokens.popover,
        borderColor: tokens.border,
        borderWidth: 1,
        padding: [8, 12],
        textStyle: { color: tokens.text, fontFamily: tokens.fontFamily, fontSize: 12 },
        extraCssText: 'border-radius:12px;box-shadow:0 12px 32px -8px rgba(0,0,0,.5);',
        formatter: (p) => `${p.marker} ${p.name}<br/><b>${formatValue ? formatValue(p.value) : p.value}</b> · ${Math.round(p.percent)}%`,
      },
      title: centerLabel === undefined || blur ? undefined : {
        text: centerLabel, subtext: centerSub, left: 'center', top: centerSub ? '36%' : '42%',
        textStyle: { color: tokens.text, fontSize: 18, fontWeight: 700, fontFamily: tokens.fontFamily },
        subtextStyle: { color: tokens.muted, fontSize: 11, fontFamily: tokens.fontFamily },
      },
      series: [{
        type: 'pie',
        radius: ['62%', '90%'],
        padAngle: 3,
        itemStyle: { borderRadius: 10, borderColor: 'transparent' },
        label: { show: false },
        emphasis: { scaleSize: 6, itemStyle: { shadowBlur: 24, shadowColor: 'rgba(0,0,0,.35)' } },
        data: data.map((d, i) => ({ name: d.name, value: d.value, itemStyle: { color: d.color || palette[i % palette.length] } })),
      }],
    };
  }, [tokens, data, centerLabel, centerSub, formatValue, blur]);

  return <EChart option={option} style={{ height }} className="w-full" ariaLabel={ariaLabel} />;
}

/** Color used for legend dots so they match the donut slices */
export function useDonutPalette() {
  const tokens = useChartTokens();
  return tokens ? [...tokens.series, tokens.muted, tokens.primary] : [];
}
