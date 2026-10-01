import { describe, expect, test } from 'vitest';
import {
  findMember, permissionsOf, hasPermissionIn, pickWorkspace, sessionState, workspaceIdOf,
  readCachedSession, writeCachedSession, clearCachedSession, rememberWorkspace, storedWorkspaceId,
} from './session';

const me = { id: 'u1', email: 'me@x.test' };
const ws = (id, members, extra = {}) => ({ id, members, ...extra });

describe('membership', () => {
  test('only an accepted membership counts', () => {
    const w = ws('w1', [
      { userId: 'u1', status: 'pending', role: 'editor' },
      { userId: 'u2', status: 'accepted', role: 'owner' },
    ]);
    expect(findMember(w, me)).toBeUndefined();
    w.members[0].status = 'accepted';
    expect(findMember(w, me).role).toBe('editor');
  });

  test('matches by id (either id field) or, for rows without a user id, by email', () => {
    expect(findMember(ws('w', [{ userId: 'u1', status: 'accepted' }]), { _id: 'u1' })).toBeTruthy();
    expect(findMember(ws('w', [{ email: 'me@x.test', status: 'accepted' }]), me)).toBeTruthy();
    expect(findMember(ws('w', [{ email: '', status: 'accepted' }]), { id: 'u9', email: '' })).toBeUndefined();
  });

  test('owners and admins have full access (null); others their flags; non-members nothing', () => {
    expect(permissionsOf({ role: 'owner' })).toBeNull();
    expect(permissionsOf({ role: 'admin', permissions: { viewExpenses: false } })).toBeNull();
    expect(permissionsOf({ role: 'viewer', permissions: { viewExpenses: true } })).toEqual({ viewExpenses: true });
    expect(permissionsOf(undefined)).toEqual({});
    expect(hasPermissionIn(null, 'editExpenses')).toBe(true);
    expect(hasPermissionIn({ editExpenses: 'yes' }, 'editExpenses')).toBe(false);
    expect(hasPermissionIn({}, 'viewExpenses')).toBe(false);
  });
});

describe('which workspace opens', () => {
  const list = [ws('a', []), ws('b', [])];
  test('the one this device used last, if still available, else the first', () => {
    expect(pickWorkspace(list, 'b').id).toBe('b');
    expect(pickWorkspace(list, 'gone').id).toBe('a');
    expect(pickWorkspace([], 'b')).toBeNull();
  });

  test('sessionState derives workspace and permissions together', () => {
    const owned = ws('a', [{ userId: 'u1', status: 'accepted', role: 'owner' }]);
    const shared = ws('b', [{ userId: 'u1', status: 'accepted', role: 'viewer', permissions: { viewExpenses: true } }]);
    expect(sessionState(me, [owned, shared], 'b')).toMatchObject({ currentWorkspace: shared, permissions: { viewExpenses: true } });
    expect(sessionState(me, [owned, shared], null).permissions).toBeNull();
    expect(sessionState(me, [], null)).toMatchObject({ currentWorkspace: null, permissions: {} });
  });

  test('workspace ids are strings whatever the shape', () => {
    expect(workspaceIdOf({ _id: 5 })).toBe('5');
    expect(workspaceIdOf(null)).toBeNull();
  });
});

describe('what the device remembers', () => {
  test('the cached session round-trips and rejects junk', () => {
    expect(readCachedSession()).toBeNull();
    writeCachedSession(me, [ws('a', [])]);
    expect(readCachedSession()).toMatchObject({ user: me, workspaces: [{ id: 'a' }] });
    localStorage.setItem('ascent_cached_session', '{not json');
    expect(readCachedSession()).toBeNull();
    localStorage.setItem('ascent_cached_session', JSON.stringify({ user: me, workspaces: 'nope' }));
    expect(readCachedSession()).toBeNull();
    writeCachedSession(me, []);
    clearCachedSession();
    expect(readCachedSession()).toBeNull();
  });

  test('the current workspace id is what the API client sends', () => {
    rememberWorkspace('w42');
    expect(localStorage.getItem('ascent_current_workspace_id')).toBe('w42');
    expect(storedWorkspaceId()).toBe('w42');
    rememberWorkspace(null);
    expect(storedWorkspaceId()).toBeNull();
  });

  test('storage that throws (private mode, blocked) never breaks the app', () => {
    const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() { throw new Error('denied'); } };
    expect(readCachedSession(broken)).toBeNull();
    expect(() => writeCachedSession(me, [], broken)).not.toThrow();
    expect(() => rememberWorkspace('x', broken)).not.toThrow();
    expect(storedWorkspaceId(broken)).toBeNull();
  });
});
