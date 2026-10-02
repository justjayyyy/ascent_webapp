import React from 'react';
import * as RadioGroup from '@radix-ui/react-radio-group';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from '../ThemeProvider';

// Literal swatches from DESIGN.md so each preview looks the same whichever theme is active.
const LOOKS = [
  { id: 'indigo', labelKey: 'paletteIndigo', canvas: 'hsl(234 34% 5.5%)', card: 'hsl(234 28% 9%)', line: 'hsl(234 20% 19%)', ink: 'hsl(228 30% 96%)', accent: 'hsl(252 92% 70%)', second: 'hsl(190 92% 56%)' },
  { id: 'light', labelKey: 'light', canvas: 'hsl(230 30% 97%)', card: 'hsl(0 0% 100%)', line: 'hsl(230 20% 89%)', ink: 'hsl(232 40% 10%)', accent: 'hsl(252 78% 56%)', second: 'hsl(190 80% 38%)' },
  { id: 'gold', labelKey: 'paletteGold', canvas: 'hsl(0 0% 0%)', card: 'hsl(40 8% 5.5%)', line: 'hsl(42 30% 14%)', ink: 'hsl(40 20% 96%)', accent: 'hsl(43 95% 58%)', second: 'hsl(24 80% 56%)' },
  { id: 'graphite', labelKey: 'paletteGraphite', canvas: 'hsl(220 12% 5.5%)', card: 'hsl(220 11% 9%)', line: 'hsl(220 10% 17%)', ink: 'hsl(40 20% 95%)', accent: 'hsl(42 62% 63%)', second: 'hsl(212 32% 66%)' },
  { id: 'ivory', labelKey: 'paletteIvory', canvas: 'hsl(240 4% 5%)', card: 'hsl(240 3.5% 8.5%)', line: 'hsl(240 3% 16%)', ink: 'hsl(42 25% 95%)', accent: 'hsl(42 35% 90%)', second: 'hsl(215 18% 64%)' },
  { id: 'burgundy', labelKey: 'paletteBurgundy', canvas: 'hsl(345 32% 5.5%)', card: 'hsl(345 24% 9%)', line: 'hsl(345 18% 17%)', ink: 'hsl(40 25% 95%)', accent: 'hsl(41 66% 62%)', second: 'hsl(345 55% 62%)' },
  { id: 'slate', labelKey: 'paletteSlate', canvas: 'hsl(218 32% 6%)', card: 'hsl(218 26% 9.5%)', line: 'hsl(218 22% 18%)', ink: 'hsl(210 30% 96%)', accent: 'hsl(207 72% 72%)', second: 'hsl(170 50% 58%)' },
  { id: 'twilight', labelKey: 'paletteTwilight', canvas: 'hsl(238 42% 5.5%)', card: 'hsl(238 34% 9%)', line: 'hsl(238 24% 19%)', ink: 'hsl(40 30% 96%)', accent: 'hsl(40 70% 68%)', second: 'hsl(250 70% 74%)' },
];

const BARS = [38, 62, 46, 78, 54, 90];

function Preview({ look }) {
  return (
    <div className="flex h-24 gap-1.5 rounded-xl p-2" style={{ background: look.canvas }} aria-hidden="true">
      <div className="flex w-3.5 flex-col items-center gap-1.5 pt-0.5">
        <span className="h-2 w-2 rounded-full" style={{ background: look.accent }} />
        {[0, 1, 2].map((i) => (
          <span key={i} className="h-1.5 w-2.5 rounded-sm" style={{ background: look.line }} />
        ))}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="h-1.5 w-1/2 rounded-full" style={{ background: look.ink, opacity: 0.85 }} />
        <div className="flex flex-1 items-end gap-1 rounded-lg p-1.5" style={{ background: look.card, boxShadow: `inset 0 0 0 1px ${look.line}` }}>
          {BARS.map((h, i) => (
            <span
              key={i}
              className="flex-1 rounded-[3px]"
              style={{ height: `${h}%`, background: i === BARS.length - 1 ? look.second : look.accent, opacity: i === BARS.length - 1 ? 1 : 0.55 + i * 0.07 }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/** The current look as a small chip with its name, for the collapsed Theme row. */
export function CurrentLook() {
  const { theme, palette, t } = useTheme();
  const look = LOOKS.find((l) => l.id === (theme === 'light' ? 'light' : palette)) || LOOKS[0];
  return (
    <>
      <span
        className="flex h-6 w-9 shrink-0 items-center justify-center gap-0.5 rounded-md"
        style={{ background: look.canvas, boxShadow: `inset 0 0 0 1px ${look.line}` }}
        aria-hidden="true"
      >
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: look.accent }} />
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: look.second }} />
      </span>
      <span className="truncate">{t(look.labelKey)}</span>
    </>
  );
}

/**
 * All looks in one control: the dark palettes (palette is per device, the logo follows it),
 * plus Light, which is the light theme (theme is stored on the user).
 */
export default function ThemePicker({ onSelect }) {
  const { theme, palette, isRTL, t } = useTheme();
  const current = theme === 'light' ? 'light' : palette;

  return (
    <RadioGroup.Root
      value={current}
      onValueChange={onSelect}
      aria-label={t('setThemeLabel')}
      dir={isRTL ? 'rtl' : 'ltr'}
      className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4"
    >
      {LOOKS.map((look) => {
        const selected = current === look.id;
        return (
          <RadioGroup.Item
            key={look.id}
            value={look.id}
            className={cn(
              'group relative rounded-2xl border p-1.5 text-start outline-none transition-[border-color,box-shadow,transform] duration-200 ease-out',
              'hover:border-foreground/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100',
              selected ? 'border-primary shadow-[0_0_0_1px_hsl(var(--primary))]' : 'border-border'
            )}
          >
            <Preview look={look} />
            <div className="flex items-center justify-between gap-1 px-1.5 pb-1 pt-2">
              <span className={cn('truncate text-[13px] font-medium', selected ? 'text-foreground' : 'text-muted-foreground')}>
                {t(look.labelKey)}
              </span>
              <span
                className={cn(
                  'flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-[opacity,transform] duration-200 ease-out',
                  selected ? 'scale-100 opacity-100' : 'scale-50 opacity-0'
                )}
              >
                <Check className="h-2.5 w-2.5" strokeWidth={3} aria-hidden="true" />
              </span>
            </div>
          </RadioGroup.Item>
        );
      })}
    </RadioGroup.Root>
  );
}
