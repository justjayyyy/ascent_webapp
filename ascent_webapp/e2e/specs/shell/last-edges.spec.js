// The last edges (GR-H04, AUTH-E10, AUTH-E07, CHK-E01): holding a grocery tile to say how much is left, the
// connection dropping while an account is created, signing in from two tabs at once, and a partner sorting out the
// same check-in payment meanwhile.
import { test, expect } from '../../fixtures.js';
import { newEmail, openApp, PASSWORD } from '../../support/app.js';
import { day, expense } from '../../support/factories.js';
import { L } from '../../support/i18n.js';
import { seedUser } from '../../support/control.js';
import { LoginScreen } from '../../screens/LoginScreen.js';

test('holding a grocery tile opens it, and "low" puts it with what is running low @critical', async ({ page, api }) => {
  await api.create('groceries', { name: 'Olive oil', onList: false, purchases: [{ id: 'a', date: day(-20), store: '' }] });
  await openApp(page, '/Groceries');
  await page.getByRole('tab', { name: L('grViewWall') }).click();
  const tile = page.getByRole('button', { name: /Olive oil/ }).first();
  const box = await tile.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.evaluate(() => new Promise((resolve) => { setTimeout(resolve, 700); }));
  await page.mouse.up();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByText('Olive oil').first()).toBeVisible();
  await sheet.getByRole('radio', { name: L('grLevelLow') }).or(sheet.getByRole('button', { name: L('grLevelLow'), exact: true })).first().click();
  await expect.poll(async () => (await api.list('groceries'))[0].level).toBe('low');
});

test('the connection dropping while an account is created: trying again makes exactly one account @critical', async ({ page, playwright, baseURL, browserName }) => {
  // The sign-up screen's controls never settle in Playwright's WebKit (TEST_PLAN.md §0.2.3), as for the auth specs
  test.skip(browserName === 'webkit', 'sign-up screen in Playwright WebKit');
  const email = newEmail('dropped');
  let dropped = false;
  await page.route(/\/api\/auth\/register$/, (route) => {
    if (dropped) return route.continue();
    dropped = true;
    return route.abort('connectionreset');
  });
  await page.goto('/login');
  const login = new LoginScreen(page);
  await login.chooseLanguage('en');
  await login.signUp({ email, name: 'Dana Dropped', password: PASSWORD });
  await expect(page).toHaveURL(/\/login/);
  // Again, as a person would
  await page.getByRole('button', { name: L('createAccount') }).last().click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 20_000 });
  const visitor = await playwright.request.newContext({ baseURL });
  expect((await visitor.post('/api/auth/login', { data: { email, password: PASSWORD } })).status()).toBe(200);
  await visitor.dispose();
});

test('signing in from two tabs at once leaves both tabs signed in @critical', async ({ page, context }) => {
  const person = await seedUser();
  const second = await context.newPage();
  const signIn = async (p) => {
    await p.goto('/login');
    const login = new LoginScreen(p);
    await login.email.fill(person.email);
    await login.continue();
    await login.password.fill(person.password);
    return p.getByRole('button', { name: L('signIn') }).last().click();
  };
  await Promise.all([signIn(page), signIn(second)]);
  await expect(page).not.toHaveURL(/\/login/);
  await expect(second).not.toHaveURL(/\/login/);
  await page.reload();
  await second.reload();
  await expect(page).not.toHaveURL(/\/login/);
  await expect(second).not.toHaveURL(/\/login/);
});

test('a payment a partner sorted out meanwhile is skipped in the check-in, without an error @critical @multiuser', async ({ page, api, member }) => {
  const sam = await member('editor', { name: 'Sam Partner' });
  const first = await api.create('transactions', expense({ description: 'Wolt', amount: 60, date: day(-2), status: 'pending' }));
  await api.create('transactions', expense({ description: 'Super-Pharm', amount: 35, date: day(-1), status: 'pending' }));
  await openApp(page, '/Dashboard');
  await expect(page.getByText(L('ciToLookAt', { n: 2 }))).toBeVisible();
  await page.getByRole('button', { name: L('ciStart') }).click();
  // On Sam's phone, the first one is confirmed meanwhile
  await sam.api.update('transactions', first.id, { status: 'confirmed' });
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByText(/Super-Pharm|Wolt/).first()).toBeVisible();
  await sheet.getByRole('button', { name: L('ciLooksRight') }).first().click();
  await expect(sheet.getByText(L('ciAllCaughtUp')).or(sheet.getByText('Wolt')).first()).toBeVisible();
  expect((await api.list('transactions')).every((t) => t.status === 'confirmed' || t.description === 'Wolt')).toBe(true);
});
