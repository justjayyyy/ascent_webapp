// The app's own API, called as a signed-in person, for setting up what a test needs before it starts and for
// checking what the server ended up with. The behaviour under test still goes through the screens.
import { expect } from '@playwright/test';

/**
 * `request` carries the person's session (page.request shares the page's cookies); `workspaceId` is the
 * household the calls are about.
 */
export function apiFor(request, workspaceId) {
  const headers = { 'x-workspace-id': workspaceId };
  async function call(method, path, data) {
    const res = await request.fetch(`/api${path}`, { method, data, headers });
    const text = await res.text();
    expect(res.ok(), `${method} /api${path} → ${res.status()}: ${text}`).toBe(true);
    return text ? JSON.parse(text).data : null;
  }
  return {
    call,
    list: (entity, query = '') => call('GET', `/entities/${entity}?limit=1000${query ? `&${query}` : ''}`),
    create: (entity, body) => call('POST', `/entities/${entity}`, body),
    update: (entity, id, body) => call('PUT', `/entities/${entity}?id=${encodeURIComponent(id)}`, body),
    remove: (entity, id) => call('DELETE', `/entities/${entity}?id=${encodeURIComponent(id)}`),
    /** The raw response, for tests about refusals */
    send: (method, path, data, extraHeaders = {}) => request.fetch(`/api${path}`, { method, data, headers: { ...headers, ...extraHeaders } }),
  };
}
