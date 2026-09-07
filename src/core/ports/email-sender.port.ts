export type EmailDeliveryOutcome =
  | 'accepted'
  | 'known_retryable_failure'
  | 'known_terminal_failure'
  | 'ambiguous';

export interface EmailMessage {
  kind: 'confirmation';
  to: string;
  managementUrl: string;
  idempotencyKey: string;
}

export interface EmailSender {
  send(message: EmailMessage): Promise<EmailDeliveryOutcome>;
}
