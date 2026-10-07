import { beforeEach, describe, expect, test, vi } from 'vitest';
import { act, render, renderHook, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth, useWorkspaceId } from './AuthContext';

const api = vi.hoisted(() => ({
  me: vi.fn(),
  list: vi.fn(),
  create: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
  googleLogin: vi.fn(),
  updateMe: vi.fn(),
  logout: vi.fn(),
  forgetToken: vi.fn(),
  authenticated: true,
}));

vi.mock('@/api/client', () => ({
  systemPrefs: () => ({ language: 'he', theme: 'light' }),
  ascent: {
    auth: {
      me: api.me,
      login: api.login,
      register: api.register,
      googleLogin: api.googleLogin,
      updateMe: api.updateMe,
      logout: api.logout,
      forgetToken: api.forgetToken,
      redirectToLogin: vi.fn(),
      isAuthenticated: () => api.authenticated,
    },
    workspaces: { list: api.list, create: api.create },
  },
}));
vi.mock('@/lib/appLock', () => ({ markUnlocked: vi.fn(), markSignedOutOnPurpose: vi.fn() }));

const ME = { id: 'u1', email: 'me@x.test', language: 'en' };
const OWNED = { id: 'w1', ownerId: 'u1', members: [{ userId: 'u1', status: 'accepted', role: 'owner' }] };
const SHARED = { id: 'w2', ownerId: 'u9', members: [{ userId: 'u1', status: 'accepted', role: 'viewer', permissions: { viewExpenses: true } }] };

const wrapper = ({ children }) => <AuthProvider>{children}</AuthProvider>;
const mount = () => renderHook(() => ({ ...useAuth(), workspaceId: useWorkspaceId() }), { wrapper });

beforeEach(() => {
  Object.values(api).forEach((f) => typeof f === 'function' && f.mockReset());
  api.authenticated = true;
  api.me.mockResolvedValue(ME);
  api.list.mockResolvedValue([OWNED, SHARED]);
  api.updateMe.mockResolvedValue({});
});

describe('starting up', () => {
  test('checks the session exactly once', async () => {
    const { result } = mount();
    await waitFor(() => expect(result.current.isLoadingAuth).toBe(false));
    await waitFor(() => expect(result.current.currentWorkspace?.id).toBe('w1'));
    await new Promise((r) => setTimeout(r, 30));
    expect(api.me).toHaveBeenCalledTimes(1);
    expect(api.list).toHaveBeenCalledTimes(1);
    expect(result.current).toMatchObject({ isAuthenticated: true, permissions: null, workspaceId: 'w1' });
    expect(localStorage.getItem('ascent_current_workspace_id')).toBe('w1');
  });

  test('without a token nothing is fetched and nobody is signed in', async () => {
    api.authenticated = false;
    const { result } = mount();
    await waitFor(() => expect(result.current.isLoadingAuth).toBe(false));
    expect(result.current.isAuthenticated).toBe(false);
    expect(api.me).not.toHaveBeenCalled();
  });

  test('a saved session opens at once, before the server answers', async () => {
    localStorage.setItem('ascent_cached_session', JSON.stringify({ user: ME, workspaces: [OWNED, SHARED] }));
    localStorage.setItem('ascent_current_workspace_id', 'w2');
    let answer;
    api.me.mockReturnValue(new Promise((r) => { answer = r; }));
    const { result } = mount();
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));
    expect(result.current).toMatchObject({ isLoadingAuth: false, workspaceId: 'w2', permissions: { viewExpenses: true } });
    await act(async () => answer(ME));
  });

  test('offline with a saved session: stays signed in on what the device knows', async () => {
    localStorage.setItem('ascent_cached_session', JSON.stringify({ user: ME, workspaces: [OWNED] }));
    api.me.mockRejectedValue(Object.assign(new Error('Could not reach the server.'), { status: 0, isNetworkError: true }));
    const { result } = mount();
    await waitFor(() => expect(api.me).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current.isAuthenticated).toBe(true);
    expect(localStorage.getItem('ascent_cached_session')).not.toBeNull();
  });

  test('a refused token is forgotten along with the saved session', async () => {
    localStorage.setItem('ascent_cached_session', JSON.stringify({ user: ME, workspaces: [OWNED] }));
    api.me.mockRejectedValue(Object.assign(new Error('Invalid or expired token'), { status: 401 }));
    const { result } = mount();
    await waitFor(() => expect(result.current.isAuthenticated).toBe(false));
    expect(api.forgetToken).toHaveBeenCalled();
    expect(localStorage.getItem('ascent_cached_session')).toBeNull();
    expect(result.current.authError).toMatchObject({ type: 'auth_required' });
  });

  test('a person left with no workspace gets one made for them', async () => {
    api.list.mockResolvedValue([]);
    api.create.mockResolvedValue(OWNED);
    const { result } = mount();
    await waitFor(() => expect(result.current.workspaceId).toBe('w1'));
    expect(api.create).toHaveBeenCalledTimes(1);
  });
});

describe('signing in', () => {
  test('a first sign-in adopts the device language and asks for the welcome', async () => {
    api.authenticated = false;
    api.login.mockResolvedValue({ user: ME, isFirstLogin: true });
    const { result } = mount();
    await waitFor(() => expect(result.current.isLoadingAuth).toBe(false));
    let user;
    await act(async () => { user = await result.current.login('me@x.test', 'pw'); });
    expect(user.language).toBe('he');
    expect(api.updateMe).toHaveBeenCalledWith({ language: 'he', theme: 'light' });
    expect(sessionStorage.getItem('showWelcomeMessage')).toBe('true');
    expect(result.current).toMatchObject({ isAuthenticated: true, workspaceId: 'w1' });
    expect(JSON.parse(localStorage.getItem('ascent_cached_session')).workspaces).toHaveLength(2);
  });

  test('a returning sign-in keeps the account preferences', async () => {
    api.authenticated = false;
    api.login.mockResolvedValue({ user: ME, isFirstLogin: false });
    const { result } = mount();
    await waitFor(() => expect(result.current.isLoadingAuth).toBe(false));
    await act(async () => { await result.current.login('me@x.test', 'pw'); });
    expect(api.updateMe).not.toHaveBeenCalled();
    expect(sessionStorage.getItem('showWelcomeMessage')).toBeNull();
  });

  test('a failed sign-in is reported and rethrown', async () => {
    api.authenticated = false;
    api.login.mockRejectedValue(new Error('Invalid email or password'));
    const { result } = mount();
    await waitFor(() => expect(result.current.isLoadingAuth).toBe(false));
    await act(async () => { await expect(result.current.login('a', 'b')).rejects.toThrow('Invalid email or password'); });
    expect(result.current).toMatchObject({ isAuthenticated: false, authError: { type: 'login_failed' } });
  });

  test('Google sign-in goes through the same path', async () => {
    api.authenticated = false;
    api.googleLogin.mockResolvedValue({ user: ME, isFirstLogin: false });
    const { result } = mount();
    await waitFor(() => expect(result.current.isLoadingAuth).toBe(false));
    await act(async () => { await result.current.loginWithGoogle('id-token'); });
    expect(api.googleLogin).toHaveBeenCalledWith('id-token');
    expect(result.current.workspaceId).toBe('w1');
  });
});

describe('workspaces and permissions', () => {
  test('switching changes the workspace, what the API is sent, and what the person may do', async () => {
    const { result } = mount();
    await waitFor(() => expect(result.current.workspaceId).toBe('w1'));
    act(() => result.current.switchWorkspace('w2'));
    expect(result.current.workspaceId).toBe('w2');
    expect(localStorage.getItem('ascent_current_workspace_id')).toBe('w2');
    expect(result.current.hasPermission('viewExpenses')).toBe(true);
    expect(result.current.hasPermission('editExpenses')).toBe(false);
    act(() => result.current.switchWorkspace('not-mine'));
    expect(result.current.workspaceId).toBe('w2');
  });

  test('being removed from the open workspace moves the person to one they still have', async () => {
    localStorage.setItem('ascent_current_workspace_id', 'w2');
    const { result } = mount();
    await waitFor(() => expect(result.current.workspaceId).toBe('w2'));
    api.list.mockResolvedValue([OWNED]);
    await act(async () => { await result.current.refreshWorkspaces(); });
    expect(result.current.workspaceId).toBe('w1');
    expect(result.current.permissions).toBeNull();
  });

  test('preference edits show at once and are saved one after another', async () => {
    const { result } = mount();
    await waitFor(() => expect(result.current.user?.id).toBe('u1'));
    const order = [];
    api.updateMe.mockImplementation(async (u) => { order.push(u); });
    let saves;
    act(() => { saves = [result.current.saveUserPrefs({ blurValues: true }), result.current.saveUserPrefs({ blurValues: false })]; });
    expect(result.current.user.blurValues).toBe(false);
    await act(() => Promise.all(saves));
    expect(order).toEqual([{ blurValues: true }, { blurValues: false }]);
  });

  test('useAuth outside the provider is a clear error', () => {
    const Broken = () => { useAuth(); return null; };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Broken />)).toThrow('useAuth must be used within an AuthProvider');
  });
});
