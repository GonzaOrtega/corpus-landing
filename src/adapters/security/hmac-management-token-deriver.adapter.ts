import { createHmac } from 'node:crypto';
import type { ManagementTokenDeriver } from '../../core/ports/management-token-deriver.port';

const CONTEXT = 'corpus-launch-management-v1';

/**
 * A deterministic HMAC keeps a launch email's bearer link stable across a
 * provider retry without persisting its raw value. The database stores only
 * a SHA-256 hash of the returned token.
 */
export class HmacManagementTokenDeriver implements ManagementTokenDeriver {
  constructor(private readonly secret: string) {
    if (Buffer.byteLength(secret) < 32) {
      throw new Error('MANAGEMENT_TOKEN_SECRET must contain at least 32 bytes');
    }
  }

  deriveLaunchToken(signupId: string): string {
    return createHmac('sha256', this.secret)
      .update(`${CONTEXT}:${signupId}`, 'utf8')
      .digest('base64url');
  }
}
