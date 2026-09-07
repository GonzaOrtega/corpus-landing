import type { TokenHasher } from '../ports/token-hasher.port';
import type { EarlyAccessSignupRepository } from '../repositories/early-access-signup.repository';

export type EarlyAccessManagementState =
  | { status: 'active'; maskedEmail: string }
  | { status: 'unsubscribed'; maskedEmail: string }
  | { status: 'invalid' };

export class ResolveEarlyAccessManagementUseCase {
  constructor(
    private readonly repository: EarlyAccessSignupRepository,
    private readonly tokenHasher: TokenHasher,
  ) {}

  async execute(rawToken: string): Promise<EarlyAccessManagementState> {
    if (rawToken.length === 0) return { status: 'invalid' };
    const signup = await this.repository.findByManageTokenHash(this.tokenHasher.hash(rawToken));
    if (!signup) return { status: 'invalid' };

    const props = signup.toProps();
    if (
      props.anonymizedAt !== null ||
      props.emailOriginal === null ||
      props.manageTokenHash === null
    ) {
      return { status: 'invalid' };
    }

    const maskedEmail = maskEmail(props.emailOriginal);
    return props.unsubscribedAt === null
      ? { status: 'active', maskedEmail }
      : { status: 'unsubscribed', maskedEmail };
  }
}

export function maskEmail(email: string): string {
  const separator = email.lastIndexOf('@');
  const local = email.slice(0, separator);
  const domain = email.slice(separator + 1);
  return `${local.slice(0, 1)}***@${domain}`;
}
