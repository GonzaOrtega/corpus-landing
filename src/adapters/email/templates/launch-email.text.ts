import type { LaunchEmailProps } from './launch-email';

export function renderLaunchEmailText(props: LaunchEmailProps): string {
  return [
    'Corpus is ready to try',
    '',
    "It's ready to try.",
    `You asked to hear when there was a build worth trying. This is it. ${props.releaseSummary}`,
    "It's a first build, and it behaves like one. What that means is below — both halves of it.",
    `Get Corpus: ${props.downloadUrl.toString()}`,
    '',
    'In the first build',
    ...props.includedFeatures.map((feature) => `- ${feature}`),
    '',
    "What isn't there yet",
    ...props.knownLimitations.map((limitation) => `- ${limitation}`),
    'Telling us what breaks is the most useful thing you can do right now. Replying to this email reaches a person.',
    '',
    'Structure creates freedom.',
    '',
    "You're receiving this because you asked for early access to Corpus. This is the email we promised.",
    `Manage early access: ${props.managementUrl}`,
    `Corpus · ${props.postalAddress}`,
  ].join('\n');
}
