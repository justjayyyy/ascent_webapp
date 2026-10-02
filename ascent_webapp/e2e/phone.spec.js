// Phone layout (iPhone 13 size, touch): every main screen fits the width, and the menu moves between them.
import { test, expect } from '@playwright/test';
import { openApp, signUpViaApi } from './helpers.js';

// Text, buttons, links and fields reaching past the screen edge, other than inside a strip that is meant to
// scroll sideways (chips, month pickers). Clipped or pushing the page wider, either way it is cut off.
function offScreen() {
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

const PAGES = ['Dashboard', 'Expenses', 'Income', 'Plans', 'Commitments', 'Notes', 'Settings'];

test('main screens fit the phone without sideways scrolling', async ({ page }) => {
  await signUpViaApi(page);
  for (const name of PAGES) {
    await openApp(page, `/${name}`);
    await page.waitForLoadState('networkidle');
    const overflow = await page.evaluate(offScreen);
    expect(overflow, `${name} is wider than the phone`).toEqual({ page: 0, cut: [] });
  }
});

test('the menu moves between screens', async ({ page }) => {
  await signUpViaApi(page);
  await openApp(page, '/Dashboard');
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  for (const [label, path] of [['Expenses', /\/Expenses/], ['Notes', /\/Notes/], ['Dashboard', /\/Dashboard/]]) {
    await page.getByRole('button', { name: 'Menu' }).tap();
    await nav.getByRole('link', { name: label }).tap();
    await expect(page).toHaveURL(path);
    await expect(page.getByRole('button', { name: 'Menu' })).toHaveAttribute('aria-expanded', 'false');
  }
});

test('the sign-in page fits the phone', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByPlaceholder('name@example.com')).toBeVisible();
  expect(await page.evaluate(offScreen)).toEqual({ page: 0, cut: [] });
});
