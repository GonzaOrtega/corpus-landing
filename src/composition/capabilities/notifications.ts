import { Resend } from 'resend';
import { FakeEmailSenderAdapter } from '../../adapters/email/fake-email-sender.adapter';
import {
  type ResendEmailClient,
  ResendEmailSenderAdapter,
} from '../../adapters/email/resend-email-sender.adapter';
import type { ServerConfig } from '../../config/server-env';
import type { EmailSender } from '../../core/ports/email-sender.port';

/**
 * Adapters for the notifications capability are constructed here, and nowhere else — see
 * construction.adapters-only-in-capabilities.
 */
export interface NotificationsDeps {
  emailSender: EmailSender;
}

/** Production mail is explicitly requested by launch operations, regardless of VERCEL_ENV. */
export const provideProductionNotifications = (config: ServerConfig): NotificationsDeps => {
  if (!config.resendApiKey || !config.emailFrom || !config.replyTo || !config.emailPostalAddress) {
    throw new Error('Email delivery configuration is required in production');
  }

  const emails = new Resend(config.resendApiKey).emails;
  const client: ResendEmailClient = {
    send: (message, options) => emails.send(message, options),
  };
  return {
    emailSender: new ResendEmailSenderAdapter(client, {
      from: config.emailFrom,
      replyTo: config.replyTo,
      postalAddress: config.emailPostalAddress,
    }),
  };
};

export const provideNotifications = (config: ServerConfig): NotificationsDeps => {
  if (process.env.VERCEL_ENV !== 'production') {
    return { emailSender: new FakeEmailSenderAdapter() };
  }
  return provideProductionNotifications(config);
};
