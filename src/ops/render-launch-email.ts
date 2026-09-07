import { render } from '@react-email/components';
import { LaunchEmail } from '../adapters/email/templates/launch-email';
import { renderLaunchEmailText } from '../adapters/email/templates/launch-email.text';
import type { LaunchEmailInput } from './launch-input.schema';

export async function renderLaunchEmail(
  input: LaunchEmailInput,
  delivery: { managementUrl: string; postalAddress: string },
) {
  const props = { ...input, ...delivery };
  return {
    subject: 'Corpus is ready to try',
    html: await render(LaunchEmail(props)),
    text: renderLaunchEmailText(props),
  };
}
