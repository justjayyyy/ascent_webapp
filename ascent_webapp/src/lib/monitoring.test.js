import { expect, test } from 'vitest';
import { scrubBreadcrumb, scrubEvent } from './monitoring';

test('reports keep the page but not its query, form data, cookies or who the person is', () => {
  const event = scrubEvent({
    request: { url: 'https://app.test/Expenses?search=pharmacy#x', data: '{"amount":5}', cookies: 'a=b', headers: { Authorization: 'Bearer t' } },
    user: { id: 'u1', email: 'dana@x.test', ip_address: '1.2.3.4' },
    breadcrumbs: [
      { category: 'console', message: 'balance 1234' },
      { category: 'fetch', data: { url: '/api/entities/transactions?from=2026-01-01', method: 'GET' } },
      { category: 'navigation', data: { from: '/Plans?plan=p1', to: '/Notes?q=secret' } },
    ],
  });
  expect(event.request).toEqual({ url: 'https://app.test/Expenses' });
  expect(event.user).toEqual({ id: 'u1' });
  expect(event.breadcrumbs).toEqual([
    { category: 'fetch', data: { url: '/api/entities/transactions', method: 'GET' } },
    { category: 'navigation', data: { from: '/Plans', to: '/Notes' } },
  ]);
  expect(scrubBreadcrumb(null)).toBeNull();
});
