import { EarlyAccessSignup } from '../entities/early-access-signup';
import type { Clock } from '../ports/clock.port';
import type {
  EmailDeliveryOutcome,
  EmailSender,
  LaunchEmailContent,
} from '../ports/email-sender.port';
import type { EarlyAccessSignupRepository } from '../repositories/early-access-signup.repository';

const PROVIDER_IDEMPOTENCY_WINDOW_MS = 24 * 60 * 60 * 1000;

export class SendLaunchEmailUseCase {
  constructor(
    private readonly repository: EarlyAccessSignupRepository,
    private readonly sender: EmailSender,
    private readonly clock: Clock,
  ) {}

  async execute(command: {
    signupId: string;
    managementUrl: string;
    input: LaunchEmailContent;
  }): Promise<void> {
    const signup = await this.repository.findById(command.signupId);
    if (!signup) return;
    const props = signup.toProps();
    if (
      props.emailOriginal === null ||
      props.anonymizedAt !== null ||
      props.unsubscribedAt !== null ||
      props.launchStatus === 'sent' ||
      props.launchStatus === 'manual_review'
    ) {
      return;
    }

    const now = this.clock.now();
    if (
      props.launchStatus === 'sending' &&
      props.launchLastAttemptAt !== null &&
      now.getTime() - props.launchLastAttemptAt.getTime() >= PROVIDER_IDEMPOTENCY_WINDOW_MS
    ) {
      await this.repository.save(
        EarlyAccessSignup.fromProps({ ...props, launchStatus: 'manual_review', updatedAt: now }),
      );
      return;
    }

    const sending = EarlyAccessSignup.fromProps({
      ...props,
      launchStatus: 'sending',
      launchAttemptCount: props.launchAttemptCount + 1,
      launchLastAttemptAt: now,
      updatedAt: now,
    });
    await this.repository.save(sending);

    let outcome: EmailDeliveryOutcome;
    try {
      outcome = await this.sender.send({
        kind: 'launch',
        to: props.emailOriginal,
        managementUrl: command.managementUrl,
        idempotencyKey: `corpus-launch-v1/${signup.id}`,
        ...command.input,
      });
    } catch {
      outcome = 'ambiguous';
    }

    const launchStatus =
      outcome === 'accepted' ? 'sent' : outcome === 'ambiguous' ? 'sending' : 'failed';
    await this.repository.save(
      EarlyAccessSignup.fromProps({
        ...sending.toProps(),
        launchStatus,
        launchSentAt: outcome === 'accepted' ? now : null,
      }),
    );
  }
}
