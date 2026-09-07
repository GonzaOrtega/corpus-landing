import { render } from '@react-email/components';
import type {
  EmailDeliveryOutcome,
  EmailMessage,
  EmailSender,
} from '../../core/ports/email-sender.port';
import { ConfirmationEmail } from './templates/confirmation-email';
import { renderConfirmationEmailText } from './templates/confirmation-email.text';

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
  ) {}

  async send(message: EmailMessage): Promise<EmailDeliveryOutcome> {
    try {
      const templateProps = {
        managementUrl: message.managementUrl,
        postalAddress: this.config.postalAddress,
      };
      const result = await this.client.send(
        {
          from: this.config.from,
          to: message.to,
          replyTo: this.config.replyTo,
          subject: "You're on the list for Corpus",
          html: await render(ConfirmationEmail(templateProps)),
          text: renderConfirmationEmailText(templateProps),
        },
        { idempotencyKey: message.idempotencyKey },
      );
      if (result.error === null) return 'accepted';
      const status = result.error.statusCode;
      if (status === 429 || (status !== null && status >= 500)) {
        return 'known_retryable_failure';
      }
      return status === null ? 'ambiguous' : 'known_terminal_failure';
    } catch {
      return 'ambiguous';
    }
  }
}
