// Layout checks that need a real browser.
import { expect } from '@playwright/test';

/**
 * Waits until the page on screen has its content rather than loading placeholders. Not 'networkidle': open
 * apps poll the workspace for changes every few seconds, so the network is never idle for long.
 */
export async function waitForPageReady(page, { timeout } = {}) {
  const main = page.locator('main');
  await expect(main).toBeVisible({ timeout });
  await expect(main.locator('.animate-pulse')).toHaveCount(0, { timeout });
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout });
  await page.evaluate(() => document.fonts.ready);
}

/**
 * Runs in the page. Controls whose tap area is under 44×44 px (DESIGN.md: "44px touch targets on coarse pointers").
 * The tap area, not the drawn box: a tap 21 px left, right, above and below the centre must still land on the control
 * (or on its <label>), which counts the invisible hit areas small buttons extend. Returns up to 20 descriptions.
 */
export function smallTouchTargets() {
  const visible = (el) => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && !el.closest('[aria-hidden=true], [inert]');
  };
  const lands = (el, x, y) => {
    const hit = document.elementFromPoint(x, y);
    if (!hit) return false;
    if (hit === el || el.contains(hit)) return true;
    const label = hit.closest('label');
    return !!label && ((el.id && label.htmlFor === el.id) || label.contains(el));
  };
  const controls = 'button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=switch], [role=checkbox], [role=radio], [role=tab], [role=link]';
  const nameOf = (node) => (node ? `${node.tagName.toLowerCase()}.${String(node.className).split(' ').slice(0, 3).join('.')}` : 'nothing');
  return [...document.querySelectorAll(controls)]
    .filter(visible)
    .map((el) => {
      const r = el.getBoundingClientRect();
      // 43.5: a box drawn at 44px can measure 43.9 after rounding
      if (r.width >= 43.5 && r.height >= 43.5) return null;
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const miss = [[cx - 21, cy], [cx + 21, cy], [cx, cy - 21], [cx, cy + 21]]
        .filter(([x, y]) => x >= 0 && y >= 0 && x < innerWidth && y < innerHeight)
        .find(([x, y]) => !lands(el, x, y));
      if (!miss) return null;
      const label = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 30);
      return `${el.tagName.toLowerCase()}${el.getAttribute('role') ? `[${el.getAttribute('role')}]` : ''} "${label}" ${Math.round(r.width)}×${Math.round(r.height)}, a tap at its edge lands on ${nameOf(document.elementFromPoint(...miss))}`;
    })
    .filter(Boolean)
    .slice(0, 20);
}

/** Waits until nothing on the page is mid-animation (fades and slides done; endless ones like the logo ignored). */
export async function settleAnimations(page) {
  await expect.poll(() => page.evaluate(() => document.getAnimations()
    .filter((a) => a.playState === 'running' && a.effect?.getComputedTiming?.().iterations !== Infinity).length)).toBe(0);
}

/**
 * Runs in the page. Text, buttons, links and fields reaching past the screen edge, other than inside a strip
 * that is meant to scroll sideways (chips, month pickers). Clipped or pushing the page wider, either way it is
 * cut off. Returns { page: extra px of page width, cut: up to 3 descriptions }.
 */
export function offScreen() {
  // The phone's own width: on a page that is too wide, a phone (and innerWidth) zooms out to fit it
  const width = document.documentElement.clientWidth;
  const scrollsSideways = (el) => {
    for (let p = el.parentElement; p; p = p.parentElement) {
      const x = getComputedStyle(p).overflowX;
      if ((x === 'auto' || x === 'scroll') && p.scrollWidth > p.clientWidth) return true;
    }
    return false;
  };
  const visible = (el) => { const cs = getComputedStyle(el); return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0; };
  const content = [...document.querySelectorAll('button, a, input, select, textarea, h1, h2, h3, p, label, [role=button]')];
  const cut = content
    .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (r.right > width + 1 || r.left < -1); })
    .filter((el) => visible(el) && !scrollsSideways(el) && !el.closest('[aria-hidden=true], [inert]'))
    .slice(0, 3)
    .map((el) => `${el.tagName.toLowerCase()} "${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 30)}"`);
  return { page: document.documentElement.scrollWidth - width, cut };
}
