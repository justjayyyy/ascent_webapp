import { describe, it, expect, beforeEach } from 'vitest';
import {
  forgetPasskeyAccount, markSignedOutOnPurpose, markUnlocked, passkeyAccount, passkeyUsedHere, rememberCredential,
  rememberPasskeyAccount, setLockPrefs, signedOutOnPurpose,
} from './appLock';

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });

describe('who the sign-in page greets', () => {
  it('names the last person to use a passkey here, by first name, while it still works here', () => {
    expect(passkeyUsedHere()).toBe(false);
    rememberPasskeyAccount('u1', 'Dana Owner');
    expect(passkeyAccount()).toBeNull(); // no passkey proven on this device yet

    rememberCredential('u1', 'cred-1');
    expect(passkeyUsedHere()).toBe(true);
    expect(passkeyAccount()).toEqual({ id: 'u1', name: 'Dana' });

    // Its passkey removed in Settings: no longer greeted
    setLockPrefs('u1', { credentialIds: [] });
    expect(passkeyAccount()).toBeNull();
  });

  it('forgets the name on "Not you?"', () => {
    rememberCredential('u1', 'cred-1');
    rememberPasskeyAccount('u1', 'Dana');
    forgetPasskeyAccount();
    expect(passkeyAccount()).toBeNull();
    expect(passkeyUsedHere()).toBe(true);
  });
});

describe('signing out on purpose', () => {
  it('holds until the next sign-in in this tab', () => {
    expect(signedOutOnPurpose()).toBe(false);
    markSignedOutOnPurpose();
    expect(signedOutOnPurpose()).toBe(true);
    expect(signedOutOnPurpose()).toBe(true); // reading does not use it up
    markUnlocked();
    expect(signedOutOnPurpose()).toBe(false);
  });
});
