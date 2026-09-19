import { Resend } from 'resend';
import { FakeEmailSenderAdapter } from '../../adapters/email/fake-email-sender.adapter';
import {
  type ResendEmailClient,
  ResendEmailSenderAdapter,
} from '../../adapters/email/resend-email-sender.adapter';
import { isPipelineRun } from '../../config/runtime-environment';
import type { ServerConfig } from '../../config/server-env';
import type { EmailSender } from '../../core/ports/email-sender.port';
import type { Logger } from '../../core/ports/logger.port';

/**
 * Adapters for the notifications capability are constructed here, and nowhere else — see
 * construction.adapters-only-in-capabilities.
 */
export interface NotificationsDeps {
  emailSender: EmailSender;
}

/** Production mail is explicitly requested by launch operations, regardless of VERCEL_ENV. */
export const provideProductionNotifications = (
  config: ServerConfig,
  logger?: Logger,
): NotificationsDeps => {
  if (!config.resendApiKey || !config.emailFrom || !config.replyTo || !config.emailPostalAddress) {
    throw new Error('Email delivery configuration is required in production');
  }

  const emails = new Resend(config.resendApiKey).emails;
  const client: ResendEmailClient = {
    send: (message, options) => emails.send(message, options),
  };
  return {
    emailSender: new ResendEmailSenderAdapter(
      client,
      {
        from: config.emailFrom,
        replyTo: config.replyTo,
        postalAddress: config.emailPostalAddress,
      },
      logger,
    ),
  };
};

/**
 * The pipeline must never send. It is excluded by explicit signal rather than by
 * absent credentials: compose bind-mounts the repo (`.:/work`) and
 * playwright.config.ts calls `loadEnvConfig`, so `.env.local` — real key
 * included — is readable inside the E2E container. Any one signal is enough;
 * the signals themselves live in `runtime-environment.ts`, shared with the
 * observability capability for the same reason.
 */
const inPipeline = (): boolean => isPipelineRun(process.env);

/**
 * Local, Preview and Production each send from their own Resend domain using
 * their own environment's credentials, so configuration presence — not the
 * environment name — decides. An environment given no sender falls back to the
 * fake rather than failing, which is what keeps the pipeline and an
 * unconfigured checkout working.
 */
export const provideNotifications = (config: ServerConfig, logger?: Logger): NotificationsDeps => {
  // Checked first so Production always fails closed rather than degrading to a
  // fake: Vercel sets CI during builds, and this ordering keeps that — or any
  // future environment quirk — from reaching the pipeline branch.
  if (process.env.VERCEL_ENV === 'production') {
    return provideProductionNotifications(config, logger);
  }
  if (inPipeline()) {
    return { emailSender: new FakeEmailSenderAdapter() };
  }
  const configured = Boolean(
    config.resendApiKey && config.emailFrom && config.replyTo && config.emailPostalAddress,
  );
  return configured
    ? provideProductionNotifications(config, logger)
    : { emailSender: new FakeEmailSenderAdapter() };
};
