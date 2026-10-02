import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ascent, request, createEntity } from './client';

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const ok = (data) => json(200, { success: true, data });

let fetchMock;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// Retries wait 1 s, 2 s...: run the clock until the request settles
async function settle(promise) {
  const result = promise.then((v) => ({ v }), (e) => ({ e }));
  for (let i = 0; i < 10; i += 1) await vi.advanceTimersByTimeAsync(2000);
  const { v, e } = await result;
  if (e) throw e;
  return v;
}

describe('requests', () => {
  test('answers with data, sending the token and the current workspace', async () => {
    localStorage.setItem('ascent_access_token', 'tok');
    localStorage.setItem('ascent_current_workspace_id', 'ws1');
    fetchMock.mockResolvedValue(ok([{ id: 1 }]));
    expect(await request('/entities/cards')).toEqual([{ id: 1 }]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/entities/cards');
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(init.headers['x-workspace-id']).toBe('ws1');
    expect(init.headers['Content-Type']).toBeUndefined(); // no body, no content type
  });

  test('a pinned workspace header wins over the stored one', async () => {
    localStorage.setItem('ascent_current_workspace_id', 'ws1');
    fetchMock.mockResolvedValue(ok([]));
    await createEntity('plans').list('startDate', 10, { headers: { 'x-workspace-id': 'ws2' } });
    expect(fetchMock.mock.calls[0][1].headers['x-workspace-id']).toBe('ws2');
    expect(fetchMock.mock.calls[0][0]).toBe('/api/entities/plans?sort=startDate&limit=10');
  });

  test('ids are encoded into the URL', async () => {
    fetchMock.mockResolvedValue(ok({}));
    await createEntity('transactions').update('a&b=c', { amount: 1 });
    expect(fetchMock.mock.calls[0][0]).toBe('/api/entities/transactions?id=a%26b%3Dc');
  });

  test('a refusal throws with the status and the server message', async () => {
    fetchMock.mockResolvedValue(json(403, { success: false, error: 'You do not have permission' }));
    await expect(request('/x', { method: 'POST', body: '{}' })).rejects.toMatchObject({ status: 403, message: 'You do not have permission' });
  });

  test('a body that is not the API envelope is an error, not data', async () => {
    fetchMock.mockResolvedValue(json(200, { hello: 1 }));
    await expect(request('/x')).rejects.toMatchObject({ message: 'The server sent an unexpected answer.' });
    fetchMock.mockResolvedValue(new Response('<html>', { status: 200, headers: { 'content-type': 'text/html' } }));
    await expect(request('/x')).rejects.toMatchObject({ status: 200 });
  });
});

describe('retries', () => {
  test('reads are retried after a dropped connection or a server error', async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(json(503, { error: 'busy' }))
      .mockResolvedValueOnce(ok('fine'));
    expect(await settle(request('/x'))).toBe('fine');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  test('writes are never repeated on their own: a lost answer must not add the row twice', async () => {
    fetchMock.mockResolvedValue(json(500, { error: 'oops' }));
    await expect(settle(request('/x', { method: 'POST', body: '{}' }))).rejects.toMatchObject({ status: 500 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('a write that is safe to repeat can opt in', async () => {
    fetchMock.mockResolvedValueOnce(json(502, {})).mockResolvedValueOnce(ok(1));
    expect(await settle(request('/x', { method: 'POST', body: '{}', retries: 1 }))).toBe(1);
  });

  test('client errors are not retried', async () => {
    fetchMock.mockResolvedValue(json(404, { error: 'nope' }));
    await expect(settle(request('/x'))).rejects.toMatchObject({ status: 404 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('no connection is reported as a network error with status 0', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(settle(request('/x', { retries: 0 }))).rejects.toMatchObject({ status: 0, isNetworkError: true, message: 'Could not reach the server.' });
  });

  test('a request that hangs times out as a network error', async () => {
    fetchMock.mockImplementation((url, { signal }) => new Promise((_, reject) => {
      signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    }));
    const pending = request('/x', { timeout: 500, retries: 0 }).catch((e) => e);
    await vi.advanceTimersByTimeAsync(600);
    expect(await pending).toMatchObject({ status: 408, isNetworkError: true });
  });
});

describe('sessions', () => {
  test('signing in stores the token and returns the user and first-login flag', async () => {
    fetchMock.mockResolvedValue(ok({ token: 'new', user: { id: 'u1' }, isFirstLogin: true }));
    expect(await ascent.auth.login('a@b.c', 'pw')).toEqual({ user: { id: 'u1' }, isFirstLogin: true });
    expect(localStorage.getItem('ascent_access_token')).toBe('new');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ email: 'a@b.c', password: 'pw' });
  });

  test('Google sign-in sends only the ID token (and device preferences)', async () => {
    fetchMock.mockResolvedValue(ok({ token: 't', user: { id: 'u1' } }));
    await ascent.auth.googleLogin('id-token');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.credential).toBe('id-token');
    expect(body).not.toHaveProperty('userInfo');
    expect(body).not.toHaveProperty('accessToken');
  });

  test('an answer without a token is not a sign-in', async () => {
    fetchMock.mockResolvedValue(ok({ user: { id: 'u1' } }));
    await expect(ascent.auth.login('a@b.c', 'pw')).rejects.toThrow();
    expect(localStorage.getItem('ascent_access_token')).toBeNull();
  });

  test('being signed in elsewhere drops the token and goes to the sign-in page', async () => {
    localStorage.setItem('ascent_access_token', 'old');
    const location = { pathname: '/Expenses', href: '/Expenses' };
    vi.stubGlobal('location', location);
    fetchMock.mockResolvedValue(json(401, { success: false, error: 'Signed in on another device', code: 'SESSION_REPLACED' }));
    await expect(request('/auth/me')).rejects.toMatchObject({ status: 401 });
    expect(localStorage.getItem('ascent_access_token')).toBeNull();
    expect(location.href).toBe('/login?reason=session_replaced');
  });
});

describe('signing out', () => {
  test('ends this device\'s session on the server and forgets the token', async () => {
    localStorage.setItem('ascent_access_token', 'tok');
    fetchMock.mockResolvedValue(ok({ signedOut: true }));
    ascent.auth.logout();
    expect(localStorage.getItem('ascent_access_token')).toBeNull();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/auth/logout');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer tok');
  });

  test('after deleting the account there is no session to end', () => {
    localStorage.setItem('ascent_access_token', 'tok');
    ascent.auth.logout(undefined, { endSession: false });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(localStorage.getItem('ascent_access_token')).toBeNull();
  });
});
