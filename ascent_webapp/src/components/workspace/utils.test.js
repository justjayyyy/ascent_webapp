import { expect, test } from 'vitest';
import { fmt, memberKey, memberName, isOnline, roleLabel } from './utils';

test('member keys and names', () => {
  expect(memberKey({ _id: 7 })).toBe('7');
  expect(memberName({ name: 'Dana', email: 'd@x.test' })).toBe('Dana');
  expect(memberName({ email: 'dana@x.test' })).toBe('dana');
  expect(memberName({ inviteKind: 'link' }, (k) => `t:${k}`)).toBe('t:wsQrInvitation');
});

test('online means seen in the last few minutes', () => {
  const now = Date.parse('2026-10-01T12:00:00Z');
  expect(isOnline({ lastSeenAt: '2026-10-01T11:59:00Z' }, now)).toBe(true);
  expect(isOnline({ lastSeenAt: '2026-10-01T10:00:00Z' }, now)).toBe(false);
  expect(isOnline({}, now)).toBe(false);
});

test('placeholders and role labels', () => {
  expect(fmt('{a} and {b}', { a: 1 })).toBe('1 and ');
  expect(roleLabel((k) => k, 'nonsense')).toBe('wsViewer');
});
