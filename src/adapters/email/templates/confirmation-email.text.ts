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
    'While you wait, a word',
    'lucent · adjective · /ˈluːs(ə)nt/',
    'clear enough for light to pass through',
    'First encountered: Heard in a podcast',
    'Met again: Read in a novel, chapter 4',
    'Used by you: In writing, 2 September',
    '',
    'Capture · Enrich · Practice',
    'Capture — one word is the whole requirement.',
    "Enrich — the entry fills itself in, after you've moved on.",
    'Practice — five words a day, drawn from your own lexicon.',
    '',
    "That's the whole commitment. No newsletter, no drip sequence.",
    '',
    "You're receiving this because you asked for early access to Corpus. We'll send one more email when there's a build worth trying.",
    `Manage early access: ${managementUrl}`,
    postalAddress,
  ].join('\n');
}
