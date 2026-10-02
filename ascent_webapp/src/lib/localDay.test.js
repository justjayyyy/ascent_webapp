import { describe, it, expect } from 'vitest';
import { localDay, localMonth } from './localDay';

describe('localDay', () => {
  it('uses the device date, not the UTC one', () => {
    // 00:30 on 1 March on this device: UTC can still be 28 February
    const lateNight = new Date(2026, 2, 1, 0, 30);
    expect(localDay(lateNight)).toBe('2026-03-01');
    expect(localMonth(lateNight)).toBe('2026-03');
  });

  it('pads months and days', () => {
    expect(localDay(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });
});
