import { beforeEach, expect, test } from 'vitest';
import { forgetInvite, joinedThrough, rememberInvite, rememberJoined, takePendingInvite } from './pendingInvite';

beforeEach(() => localStorage.clear());

test('an invitation opened while signed out is handed over once', () => {
  rememberInvite('tok', 1000);
  expect(takePendingInvite(2000)).toBe('tok');
  expect(takePendingInvite(2000)).toBeNull();
});

test('an old or forgotten invitation is not joined', () => {
  rememberInvite('tok', 0);
  expect(takePendingInvite(49 * 60 * 60 * 1000)).toBeNull();
  rememberInvite('tok', 0);
  forgetInvite();
  expect(takePendingInvite(1)).toBeNull();
});

test('the invitation page finds the workspace its token joined, and only for that token', () => {
  rememberJoined('tok', 'w9');
  expect(joinedThrough('tok')).toBe('w9');
  expect(joinedThrough('other')).toBeNull();
});
