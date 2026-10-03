// The AI assistant (Claude, stubbed in the e2e API: harness/outbound.mjs): off until an owner turns it on, then logs
// expenses from a sentence and answers questions about the household's money.
import { test, expect } from '../../fixtures.js';
import { openApp } from '../../support/app.js';
import { L } from '../../support/i18n.js';

// What the stub answers to any question (harness/outbound.mjs ASSISTANT_ANSWER)
const ANSWER = 'Food and dining is your biggest category this month.';

const turnOn = (api, workspaceId) => api.call('PUT', `/workspaces?id=${workspaceId}&action=settings`, { aiAssistant: true });

async function ask(page, text) {
  const input = page.getByLabel(L('askTitle'));
  await input.fill(text);
  await page.getByRole('button', { name: L('askSend'), exact: true }).click();
}

test('an owner turns the assistant on, then logs an expense by typing a sentence @critical', async ({ page, api }) => {
  await openApp(page, '/Settings');
  const ai = page.getByRole('switch', { name: L('aiTitle') });
  await expect(ai).not.toBeChecked();
  await ai.click();
  await expect(ai).toBeChecked();

  await openApp(page, '/Dashboard');
  await ask(page, 'coffee 18 with Max');
  const draft = page.getByText(L('askDraft')).locator('..');
  await expect(page.getByText(L('askDraft'))).toBeVisible();
  await expect(draft).toContainText('18');
  await page.getByRole('button', { name: L('askAdd'), exact: true }).click();

  await expect.poll(async () => (await api.list('transactions')).map((t) => [t.type, t.amount, t.description, t.category]))
    .toEqual([['Expense', 18, 'coffee', 'food_dining']]);
});

test('a question gets an answer from the household’s own numbers, with a note on where it comes from @critical', async ({ page, owner, api }) => {
  await turnOn(api, owner.workspaceId);
  await openApp(page, '/Dashboard');
  await ask(page, 'how much did we spend on food compared with last month?');
  await expect(page.getByText(ANSWER)).toBeVisible();
  await expect(page.getByText(L('askAiNote'))).toBeVisible();
});

test('while it is off there is no assistant, and the API refuses it @critical', async ({ page, owner, api }) => {
  await openApp(page, '/Dashboard');
  await expect(page.getByLabel(L('askTitle'))).toHaveCount(0);
  const res = await api.send('POST', '/assist?action=parse', { text: 'coffee 18' });
  expect(res.status()).toBe(403);
  expect((await res.json()).error).toBe('ai_disabled');
  // Turning it on is for owners and admins
  expect(owner.workspaceId).toBeTruthy();
});

test('only owners and admins can turn it on @critical', async ({ owner, member }) => {
  const sam = await member('editor');
  await openApp(sam.page, '/Settings');
  await expect(sam.page.getByRole('switch', { name: L('aiTitle') })).toBeDisabled();
  const res = await sam.api.send('PUT', `/workspaces?id=${owner.workspaceId}&action=settings`, { aiAssistant: true });
  expect(res.status()).toBe(403);
});

test('when the model is overloaded, the assistant says so and nothing is added @critical', async ({ page, owner, api, stubs }) => {
  await turnOn(api, owner.workspaceId);
  await openApp(page, '/Dashboard');
  await stubs.set({ ai: 'overloaded' });
  await ask(page, 'coffee 18');
  await expect(page.getByText(L('askFailed'))).toBeVisible();
  expect(await api.list('transactions')).toEqual([]);
});

// Known bug: on a refusal the SDK's messages.parse() tries to read the empty answer as JSON and throws before
// server/lib/assistant.js looks at stop_reason, so people get "something went wrong" (askFailed), never the
// declined message. When fixed (check the refusal before parsing), remove test.fail. See TEST_PLAN.md §0.2.3.
test('when the model declines, the assistant says it cannot help with that @critical', async ({ page, owner, api, stubs }) => {
  test.fail(true, 'known bug: refusals surface as a generic failure');
  await turnOn(api, owner.workspaceId);
  await openApp(page, '/Dashboard');
  await stubs.set({ ai: 'refusal' });
  await ask(page, 'coffee 18');
  await expect(page.getByText(L('askDeclined'))).toBeVisible({ timeout: 5000 });
});
