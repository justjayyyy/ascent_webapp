// Accessibility checked in the real browser, with axe. jsdom (src/test/a11y.test.jsx) already checks the markup;
// here it is the rendered page: colour contrast in every theme, what is actually on screen, dialogs as opened.
import { expect, test } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/**
 * Fails the test on any WCAG A/AA violation in `include` (the whole page by default) and attaches the full
 * results. `disable`: rule ids known to be wrong for a reason written next to the call.
 */
export async function expectAccessible(page, name, { include, exclude, disable = [] } = {}) {
  let builder = new AxeBuilder({ page }).withTags(TAGS).disableRules(disable);
  if (include) builder = builder.include(include);
  if (exclude) builder = builder.exclude(exclude);
  const { violations } = await builder.analyze();
  await test.info().attach(`axe: ${name}`, { body: JSON.stringify(violations, null, 2), contentType: 'application/json' });
  const contrast = (n) => {
    const d = n.any?.find((c) => c.id === 'color-contrast')?.data;
    return d ? ` ${d.fgColor} on ${d.bgColor} is ${d.contrastRatio}:1, needs ${d.expectedContrastRatio}` : '';
  };
  const summary = violations.flatMap((v) => v.nodes.map((n) => `${v.id} (${v.impact}): ${n.target.join(' ')}${contrast(n)}`));
  // Soft, so one run lists every screen's problems rather than stopping at the first
  expect.soft(summary, `accessibility of ${name}`).toEqual([]);
}
