/**
 * Must return a cryptographically random, single-use, high-entropy opaque
 * string (≥256 bits) — this token gates account management, not a UI id.
 */
export interface TokenGenerator {
  generate(): string;
}
