import type { TokenGenerator } from '../ports/token-generator.port';

/** Predictable, strictly increasing tokens for tests — never for real traffic. */
export class DeterministicTokenAdapter implements TokenGenerator {
  private counter = 0;

  generate(): string {
    this.counter += 1;
    return `test-token-${this.counter}`;
  }
}
