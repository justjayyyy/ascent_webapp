// Layout checks that need a real browser.
import { expect } from '@playwright/test';

/**
 * Waits until the page on screen has its content rather than loading placeholders. Not 'networkidle': open
 * apps poll the workspace for changes every few seconds, so the network is never idle for long.
 */
export async function waitForPageReady(page) {
  const main = page.locator('main');
  await expect(main).toBeVisible();
  await expect(main.locator('.animate-pulse')).toHaveCount(0);
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
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
