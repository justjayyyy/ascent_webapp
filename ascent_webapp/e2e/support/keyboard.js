// Using the app with the keyboard alone: moving focus with Tab and reading what has it.
import { expect } from '@playwright/test';

/** Runs in the page: the focused element's accessible-ish name and role, and whether its focus shows (an outline or a ring). */
export function focused() {
  const el = document.activeElement;
  if (!el || el === document.body) return null;
  const labelled = el.getAttribute('aria-labelledby');
  const byLabel = el.id && document.querySelector(`label[for="${el.id}"]`)?.textContent;
  const name = el.getAttribute('aria-label')
    || (labelled && labelled.split(' ').map((id) => document.getElementById(id)?.textContent || '').join(' '))
    || byLabel || el.getAttribute('placeholder') || el.textContent || '';
  const cs = getComputedStyle(el);
  const visible = (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || (!!cs.boxShadow && cs.boxShadow !== 'none');
  return { name: name.trim().replace(/\s+/g, ' '), role: el.getAttribute('role') || el.tagName.toLowerCase(), inDialog: !!el.closest('[role=dialog], [role=alertdialog]'), visible };
}

/** Presses Tab (Shift+Tab with `back`) until the focused element's name matches, as a keyboard user would. Already there counts. */
export async function tabTo(page, name, { max = 80, back = false } = {}) {
  const match = (n) => (name instanceof RegExp ? name.test(n) : n === name);
  const first = await page.evaluate(focused);
  if (first && match(first.name)) return first;
  for (let i = 0; i < max; i += 1) {
    await page.keyboard.press(back ? 'Shift+Tab' : 'Tab');
    const now = await page.evaluate(focused);
    if (now && match(now.name)) return now;
  }
  throw new Error(`Tab never reached "${name}" in ${max} presses`);
}

/** Runs in the page: whether the focused element shows where focus is (an outline or a ring). */
export function focusIsVisible() {
  const el = document.activeElement;
  if (!el || el === document.body) return false;
  const cs = getComputedStyle(el);
  const outline = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0;
  const ring = cs.boxShadow && cs.boxShadow !== 'none';
  return outline || ring;
}

export const expectFocusIn = async (page, predicate, message) =>
  expect.poll(async () => predicate(await page.evaluate(focused)), { message }).toBe(true);

/** The focus stops (from `focused`) whose focus could not be seen, once each. */
export const unseen = (stops) => [...new Set(stops.filter((f) => f && !f.visible).map((f) => `${f.role} "${f.name.slice(0, 30)}"`))];
