import type { EmailSender } from '../../core/ports/email-sender.port';

/** Non-network delivery boundary for local, CI, and preview environments. */
export class FakeEmailSenderAdapter implements EmailSender {
  async send(): Promise<'accepted'> {
    return 'accepted';
  }
}
