import React, { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, LineChart, PieChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, AriaComponent, TitleComponent } from 'echarts/components';
import { LabelLayout } from 'echarts/features';
import { CanvasRenderer } from 'echarts/renderers';
import { useTheme } from '@/components/ThemeProvider';

echarts.use([BarChart, LineChart, PieChart, GridComponent, TooltipComponent, AriaComponent, TitleComponent, LabelLayout, CanvasRenderer]);

const readVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
// zrender only understands comma-separated hsl()/hsla(), so build that form from the CSS variable
const hsl = (name, alpha) => {
  const parts = readVar(name).split(/\s+/);
  if (parts.length < 3) return alpha === undefined ? '#888' : `rgba(136,136,136,${alpha})`;
  const [h, sat, l] = parts;
  return alpha === undefined ? `hsl(${h}, ${sat}, ${l})` : `hsla(${h}, ${sat}, ${l}, ${alpha})`;
};

/** Apply alpha to a color produced by useChartTokens (hsl(...) -> hsla(...)). */
export const withAlpha = (color, a) => color.replace(/^hsla?\(/, 'hsla(').replace(/(, [\d.]+)?\)$/, `, ${a})`);

/** Design tokens for charts, resolved from the active CSS variables (theme + palette aware). */
export function useChartTokens() {
  const { theme } = useTheme();
  const [tokens, setTokens] = useState(null);
  useEffect(() => {
    const compute = () => setTokens({
      text: hsl('--foreground'),
      muted: hsl('--muted-foreground'),
      grid: hsl('--border', 0.6),
      card: hsl('--card'),
      popover: hsl('--popover'),
      border: hsl('--border'),
      primary: hsl('--primary'),
      success: hsl('--success'),
      danger: hsl('--danger'),
      series: [1, 2, 3, 4, 5].map((i) => hsl(`--chart-${i}`)),
      fontFamily: getComputedStyle(document.documentElement).fontFamily,
    });
    compute();
    // palette can change at runtime (?palette=...)
    const mo = new MutationObserver(compute);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-palette', 'class'] });
    return () => mo.disconnect();
  }, [theme]);
  return tokens;
}

/** Thin, tree-shaken Apache ECharts wrapper with auto-resize and animated updates. */
export default function EChart({ option, className, style, ariaLabel }) {
  const ref = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    const chart = echarts.init(ref.current, null, { renderer: 'canvas' });
    chartRef.current = chart;
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(ref.current);
    return () => { ro.disconnect(); chart.dispose(); chartRef.current = null; };
  }, []);

  useEffect(() => {
    if (chartRef.current && option) chartRef.current.setOption(option, { notMerge: true });
  }, [option]);

  return <div ref={ref} className={className} style={style} role="img" aria-label={ariaLabel} />;
}
