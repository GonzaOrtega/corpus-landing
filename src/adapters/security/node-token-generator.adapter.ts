import { randomBytes } from 'node:crypto';
import type { TokenGenerator } from '../../core/ports/token-generator.port';

const TOKEN_BYTES = 32; // 256 bits, per the port's contract

export class NodeTokenGeneratorAdapter implements TokenGenerator {
  generate(): string {
    return randomBytes(TOKEN_BYTES).toString('base64url');
  }
}
