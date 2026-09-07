import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { Sha256TokenHasherAdapter } from './sha256-token-hasher.adapter';

describe('Sha256TokenHasherAdapter', () => {
  it('hashes deterministically — same input, same output', () => {
    const hasher = new Sha256TokenHasherAdapter();
    expect(hasher.hash('token-abc')).toBe(hasher.hash('token-abc'));
  });

  it('produces a 64-character lowercase hex digest', () => {
    const hasher = new Sha256TokenHasherAdapter();
    expect(hasher.hash('token-abc')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('matches an independently computed SHA-256 hex digest', () => {
    const hasher = new Sha256TokenHasherAdapter();
    const input = 'token-abc';
    expect(hasher.hash(input)).toBe(createHash('sha256').update(input).digest('hex'));
  });
});
