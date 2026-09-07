/**
 * One-way only — never decrypt/recover the token from this. No salt needed:
 * the input is already a high-entropy random token (see TokenGenerator), not
 * a low-entropy secret, so a fast deterministic hash (e.g. SHA-256) is
 * correct here, not a password KDF.
 */
export interface TokenHasher {
  hash(token: string): string;
}
