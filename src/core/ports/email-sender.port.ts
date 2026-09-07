export type EmailDeliveryOutcome =
  | 'accepted'
  | 'known_retryable_failure'
  | 'known_terminal_failure'
  | 'ambiguous';

export interface ConfirmationEmailMessage {
  kind: 'confirmation';
  to: string;
  managementUrl: string;
  idempotencyKey: string;
}

export interface LaunchEmailContent {
  releaseVersion: string;
  releaseSummary: string;
  includedFeatures: string[];
  knownLimitations: string[];
  downloadUrl: URL;
}

export interface LaunchEmailMessage extends LaunchEmailContent {
  kind: 'launch';
  to: string;
  managementUrl: string;
  idempotencyKey: string;
}

export type EmailMessage = ConfirmationEmailMessage | LaunchEmailMessage;

export interface EmailSender {
  send(message: EmailMessage): Promise<EmailDeliveryOutcome>;
}
