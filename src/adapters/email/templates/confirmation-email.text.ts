import type { ConfirmationEmailProps } from './confirmation-email';

export function renderConfirmationEmailText({
  managementUrl,
  postalAddress,
}: ConfirmationEmailProps): string {
  return [
    "You're on the list for Corpus",
    '',
    "You're on the list.",
    '',
    "Corpus is still in private development. You're confirmed for early access. We'll write again when there's a build worth trying. Early access begins on Android.",
    '',
    'lucent — clear enough for light to pass through',
    'Capture · Enrich · Practice',
    '',
    "That's the whole commitment. No newsletter, no drip sequence.",
    '',
    "You're receiving this because you asked for early access to Corpus. We'll send one more email when there's a build worth trying.",
    `Manage early access: ${managementUrl}`,
    postalAddress,
  ].join('\n');
}
