import { createHash } from 'node:crypto';
import type { TokenHasher } from '../../core/ports/token-hasher.port';

export class Sha256TokenHasherAdapter implements TokenHasher {
  hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
