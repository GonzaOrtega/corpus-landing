import { EarlyAccessSignup } from '../entities/early-access-signup';
import type { Clock } from '../ports/clock.port';
import type { EmailDeliveryOutcome, EmailSender } from '../ports/email-sender.port';
import type { Logger } from '../ports/logger.port';
import type { EarlyAccessSignupRepository } from '../repositories/early-access-signup.repository';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const MAX_CONFIRMATION_ATTEMPTS = 3;

export interface ConfirmationEmailConfig {
  siteUrl: URL;
}

export class SendConfirmationEmailUseCase {
  constructor(
    private readonly repository: EarlyAccessSignupRepository,
    private readonly sender: EmailSender,
    private readonly clock: Clock,
    private readonly logger: Logger,
    private readonly config: ConfirmationEmailConfig,
  ) {}

  async execute(input: { signupId: string; managementToken: string }): Promise<void> {
    const signup = await this.repository.findById(input.signupId);
    if (!signup) return;
    const props = signup.toProps();
    if (props.emailOriginal === null || props.anonymizedAt !== null) return;

    const now = this.clock.now();
    const attemptCount = props.confirmationAttemptCount + 1;
    const managementUrl = new URL('/early-access/manage', this.config.siteUrl);
    managementUrl.hash = input.managementToken;
    let outcome: EmailDeliveryOutcome;
    try {
      outcome = await this.sender.send({
        kind: 'confirmation',
        to: props.emailOriginal,
        managementUrl: managementUrl.toString(),
        idempotencyKey: `corpus-confirmation-v1/${signup.id}/${attemptCount}`,
      });
    } catch {
      outcome = 'ambiguous';
    }

    const updated = this.applyOutcome(signup, outcome, now, attemptCount);
    await this.repository.save(updated);
    if (outcome === 'ambiguous') {
      this.logger.error('Confirmation provider outcome was ambiguous', {
        operation: 'send_confirmation',
        signupId: signup.id,
        status: 'exhausted',
        errorCode: 'AMBIGUOUS_PROVIDER_OUTCOME',
        attemptCount,
      });
    }
  }

  private applyOutcome(
    signup: EarlyAccessSignup,
    outcome: EmailDeliveryOutcome,
    now: Date,
    attemptCount: number,
  ): EarlyAccessSignup {
    const exhausted =
      outcome === 'ambiguous' ||
      outcome === 'known_terminal_failure' ||
      (outcome === 'known_retryable_failure' && attemptCount >= MAX_CONFIRMATION_ATTEMPTS);
    const sent = outcome === 'accepted';
    return EarlyAccessSignup.fromProps({
      ...signup.toProps(),
      updatedAt: now,
      confirmationStatus: sent ? 'sent' : exhausted ? 'exhausted' : 'failed',
      confirmationAttemptCount: attemptCount,
      confirmationLastAttemptAt: now,
      confirmationNextAttemptAt:
        outcome === 'known_retryable_failure' && !exhausted
          ? new Date(now.getTime() + ONE_DAY_MS)
          : null,
      confirmationSentAt: sent ? now : null,
    });
  }
}
