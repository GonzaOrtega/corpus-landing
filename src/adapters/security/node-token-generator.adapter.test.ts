import { describe, expect, it } from 'vitest';
import { NodeTokenGeneratorAdapter } from './node-token-generator.adapter';

describe('NodeTokenGeneratorAdapter', () => {
  it('generates a token with at least 256 bits of entropy — base64url needs ≥43 chars for that', () => {
    const generator = new NodeTokenGeneratorAdapter();
    const token = generator.generate();
    expect(token.length).toBeGreaterThanOrEqual(43);
  });

  it('generates only URL-safe base64 characters, no padding', () => {
    const generator = new NodeTokenGeneratorAdapter();
    expect(generator.generate()).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('generates a different token on every call', () => {
    const generator = new NodeTokenGeneratorAdapter();
    const tokens = new Set(Array.from({ length: 50 }, () => generator.generate()));
    expect(tokens.size).toBe(50);
  });
});
