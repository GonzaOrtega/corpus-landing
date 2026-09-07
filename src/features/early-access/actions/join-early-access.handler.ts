import { SignupClosedError } from '../../../core/errors/early-access-errors';
import type { EarlyAccessBackend } from '../backend/early-access-backend';
import { signupSchema } from '../schemas/signup.schema';
import type { SignupActionState } from './join-early-access.action';

export async function handleJoinEarlyAccess(
  backend: EarlyAccessBackend,
  formData: FormData,
): Promise<SignupActionState> {
  const parsed = signupSchema.safeParse({
    email: formData.get('email'),
    captchaToken: formData.get('captchaToken'),
  });
  if (!parsed.success) {
    const emailInvalid = parsed.error.issues.some((issue) => issue.path[0] === 'email');
    if (!emailInvalid) {
      return { status: 'retry', message: "We couldn't complete that signup. Please try again." };
    }
    return {
      status: 'invalid-email',
      message: 'That address looks incomplete. Check it and try again.',
    };
  }

  try {
    await backend.join(parsed.data);
    return {
      status: 'success',
      message:
        "You're on the list. Check your inbox for confirmation — we'll write again when Corpus is ready.",
    };
  } catch (error) {
    if (error instanceof SignupClosedError) return { status: 'closed' };
    return { status: 'retry', message: "We couldn't complete that signup. Please try again." };
  }
}
