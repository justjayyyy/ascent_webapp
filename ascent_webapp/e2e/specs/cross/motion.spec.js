// Reduced motion (WCAG 2.3.3, PRODUCT.md): with the setting on, nothing keeps moving on its own. Fades, colour and
// spinners may stay; drawn figures hold still and looping animations stop.
import { test, expect } from '../../fixtures.js';
import { openApp } from '../../support/app.js';

/** Runs in the page: every drawn shape's geometry by element (tagged so the next call finds the same one), and the
 * looping CSS animations still running. */
function motionState() {
  const where = (el) => {
    const svg = el.closest('svg');
    const label = svg.getAttribute('aria-label') || svg.closest('[aria-label]')?.getAttribute('aria-label');
    return `${el.tagName} in ${label || svg.getAttribute('class') || svg.parentElement?.className || 'svg'}`.slice(0, 90);
  };
  window.__shapeIds ??= 0;
  const shapes = [...document.querySelectorAll('svg path, svg circle, svg ellipse, svg g, svg rect')].map((el) => {
    el.__shapeId ??= (window.__shapeIds += 1);
    return [el.__shapeId, where(el), ['d', 'cx', 'cy', 'rx', 'transform', 'opacity'].map((a) => el.getAttribute(a) || '').join('|')];
  });
  const loops = document.getAnimations()
    .filter((a) => a.playState === 'running' && a.effect?.getTiming().iterations === Infinity)
    .map((a) => a.animationName || 'unnamed')
    .filter((name) => !/spin|pulse|shimmer/.test(name));
  return { shapes, loops: [...new Set(loops)] };
}

/** What still moves over a second and a bit: looping animations by name, and the drawn shapes that changed. */
async function stillness(page) {
  const before = await page.evaluate(motionState);
  await page.evaluate(() => new Promise((resolve) => { setTimeout(resolve, 1200); }));
  const after = await page.evaluate(motionState);
  // Shapes that came or went are not movement; the same element drawn differently is
  const was = new Map(before.shapes.map(([id, , geometry]) => [id, geometry]));
  const moved = after.shapes.filter(([id, , geometry]) => was.has(id) && was.get(id) !== geometry).map(([, at]) => at);
  return { loops: after.loops, moved: [...new Set(moved)] };
}

const STILL = { loops: [], moved: [] };

test.describe('with reduced motion', () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
  });

  test('the sign-in page holds still @a11y', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('#summit-email')).toBeVisible();
    expect(await stillness(page)).toEqual(STILL);
  });

  test('the Dashboard holds still @a11y', async ({ page, owner: _owner }) => {
    await openApp(page, '/Dashboard');
    expect(await stillness(page)).toEqual(STILL);
  });
});

test('without it, the sign-in climber moves, so the check above can see motion @a11y', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/login');
  await expect(page.locator('#summit-email')).toBeVisible();
  await expect.poll(async () => (await stillness(page)).moved.length).toBeGreaterThan(0);
});
