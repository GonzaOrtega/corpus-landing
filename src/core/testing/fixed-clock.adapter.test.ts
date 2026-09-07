import { describe, expect, it } from 'vitest';
import { FixedClockAdapter } from './fixed-clock.adapter';

describe('FixedClockAdapter', () => {
  it('always returns the date it was constructed with', () => {
    const fixed = new Date('2026-09-06T12:00:00Z');
    const clock = new FixedClockAdapter(fixed);
    expect(clock.now()).toBe(fixed);
    expect(clock.now()).toBe(fixed);
  });
});
