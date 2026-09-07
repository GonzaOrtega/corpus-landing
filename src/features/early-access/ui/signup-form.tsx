'use client';

import { type FormEvent, useActionState, useTransition } from 'react';
import { joinEarlyAccessAction, type SignupActionState } from '../actions/join-early-access.action';
import { getRecaptchaToken, RecaptchaBridge } from './recaptcha-bridge';

const initialState: SignupActionState = { status: 'idle' };

interface SignupFormProps {
  recaptchaSiteKey: string | null;
}

export function SignupForm({ recaptchaSiteKey }: SignupFormProps) {
  const [state, submitAction] = useActionState(joinEarlyAccessAction, initialState);
  const [isPending, startTransition] = useTransition();

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    try {
      formData.set(
        'captchaToken',
        recaptchaSiteKey ? await getRecaptchaToken(recaptchaSiteKey) : 'test-pass',
      );
    } catch {
      formData.set('captchaToken', '');
    }

    startTransition(() => submitAction(formData));
  };

  const message =
    state.status === 'closed'
      ? 'Early access is no longer open.'
      : state.status === 'success' || state.status === 'invalid-email' || state.status === 'retry'
        ? state.message
        : undefined;

  return (
    <form
      action={submitAction}
      className="signup-form"
      noValidate
      onSubmit={recaptchaSiteKey ? submit : undefined}
    >
      {recaptchaSiteKey && <RecaptchaBridge siteKey={recaptchaSiteKey} />}
      <input name="captchaToken" type="hidden" value={recaptchaSiteKey ? '' : 'test-pass'} />
      <div className="signup-field">
        <label htmlFor="early-access-email">Email address</label>
        <input
          autoComplete="email"
          disabled={isPending || state.status === 'success' || state.status === 'closed'}
          id="early-access-email"
          inputMode="email"
          name="email"
          placeholder="you@example.com"
          required
          spellCheck={false}
          type="email"
        />
        <button
          className="button button-solid"
          disabled={isPending || state.status === 'closed'}
          type="submit"
        >
          {isPending ? 'Joining…' : 'Join the list'}
        </button>
      </div>
      <p className="signup-consent">
        By joining, you agree to receive a confirmation email and one launch notification when
        Corpus is ready. No newsletter. Unsubscribe anytime.
      </p>
      <output aria-atomic="true" aria-live="polite" className="signup-status">
        {message}
      </output>
    </form>
  );
}
