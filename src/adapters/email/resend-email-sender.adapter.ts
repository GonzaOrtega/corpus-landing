import { render } from '@react-email/components';
import type {
  EmailDeliveryOutcome,
  EmailMessage,
  EmailSender,
} from '../../core/ports/email-sender.port';
import type { Logger } from '../../core/ports/logger.port';
import { ConfirmationEmail } from './templates/confirmation-email';
import { renderConfirmationEmailText } from './templates/confirmation-email.text';
import { LaunchEmail } from './templates/launch-email';
import { renderLaunchEmailText } from './templates/launch-email.text';

interface ResendError {
  statusCode: number | null;
}

type ResendResult = { data: { id: string }; error: null } | { data: null; error: ResendError };

export interface ResendEmailClient {
  send(
    message: {
      from: string;
      to: string;
      replyTo: string;
      subject: string;
      html: string;
      text: string;
    },
    options: { idempotencyKey: string },
  ): Promise<ResendResult>;
}

export class ResendEmailSenderAdapter implements EmailSender {
  constructor(
    private readonly client: ResendEmailClient,
    private readonly config: { from: string; replyTo: string; postalAddress: string },
    private readonly logger?: Logger,
  ) {}

  /**
   * The provider's HTTP status is the one piece of diagnosis worth keeping: a
   * rejected sender identity and an outage both collapse into a single
   * `EmailDeliveryOutcome` otherwise, leaving nothing to act on. The response
   * body and the recipient stay out of the log line — launch-email.md allows
   * only operation names, UUIDs, states, counts and timings.
   */
  async send(message: EmailMessage): Promise<EmailDeliveryOutcome> {
    try {
      const templateProps = {
        managementUrl: message.managementUrl,
        postalAddress: this.config.postalAddress,
      };
      const rendered =
        message.kind === 'confirmation'
          ? {
              subject: "You're on the list for Corpus",
              html: await render(ConfirmationEmail(templateProps)),
              text: renderConfirmationEmailText(templateProps),
            }
          : {
              subject: 'Corpus is ready to try',
              html: await render(LaunchEmail({ ...message, ...templateProps })),
              text: renderLaunchEmailText({ ...message, ...templateProps }),
            };
      const result = await this.client.send(
        {
          from: this.config.from,
          to: message.to,
          replyTo: this.config.replyTo,
          ...rendered,
        },
        { idempotencyKey: message.idempotencyKey },
      );
      if (result.error === null) return 'accepted';
      const status = result.error.statusCode;
      const outcome: EmailDeliveryOutcome =
        status === 429 || (status !== null && status >= 500)
          ? 'known_retryable_failure'
          : status === null
            ? 'ambiguous'
            : 'known_terminal_failure';
      this.logger?.error('Email provider rejected the message', {
        operation: 'resend_send',
        status: outcome,
        errorCode: status === null ? 'PROVIDER_STATUS_UNKNOWN' : `PROVIDER_STATUS_${status}`,
      });
      return outcome;
    } catch {
      this.logger?.error('Email provider call threw', {
        operation: 'resend_send',
        status: 'ambiguous',
        errorCode: 'PROVIDER_EXCEPTION',
      });
      return 'ambiguous';
    }
  }
}
