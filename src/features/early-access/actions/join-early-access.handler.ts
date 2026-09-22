import { CaptchaRejectedError, SignupClosedError } from '../../../core/errors/early-access-errors';
import type { ErrorReporter } from '../../../core/ports/error-reporter.port';
import type { EarlyAccessBackend } from '../backend/early-access-backend';
import { signupSchema } from '../schemas/signup.schema';
import type { SignupActionState } from './join-early-access.action';

const RETRY: SignupActionState = {
  status: 'retry',
  message: "We couldn't complete that signup. Please try again.",
};

export async function handleJoinEarlyAccess(
  backend: EarlyAccessBackend,
  formData: FormData,
  reporter: ErrorReporter,
): Promise<SignupActionState> {
  const parsed = signupSchema.safeParse({
    email: formData.get('email'),
    captchaToken: formData.get('captchaToken'),
  });
  if (!parsed.success) {
    const emailInvalid = parsed.error.issues.some((issue) => issue.path[0] === 'email');
    if (!emailInvalid) return RETRY;
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
    // A rejected CAPTCHA is the verifier doing its job, not a fault. Everything
    // else that reaches here — a database outage, a provider timeout — is
    // collapsed into the same public state on purpose (§24), so this is the
    // only place it can still be seen.
    if (!(error instanceof CaptchaRejectedError)) {
      reporter.captureException(error, { operation: 'join_early_access' });
    }
    return RETRY;
  }
}
