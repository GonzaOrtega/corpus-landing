import type { Clock } from '../ports/clock.port';

export class FixedClockAdapter implements Clock {
  constructor(private readonly fixed: Date) {}

  now(): Date {
    return this.fixed;
  }
}
