import { describe, expect, it } from 'vitest';
import { DeterministicTokenAdapter } from './deterministic-token.adapter';

describe('DeterministicTokenAdapter', () => {
  it('generates distinct, predictable tokens in sequence', () => {
    const generator = new DeterministicTokenAdapter();
    expect(generator.generate()).toBe('test-token-1');
    expect(generator.generate()).toBe('test-token-2');
  });
});
