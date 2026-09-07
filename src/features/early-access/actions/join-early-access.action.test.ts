import { beforeEach, describe, expect, it } from 'vitest';
import { CaptchaRejectedError, SignupClosedError } from '../../../core/errors/early-access-errors';
import { handleJoinEarlyAccess } from './join-early-access.handler';

let joinCalls = 0;
let joinBehavior: () => Promise<void>;
const backend = {
  join: async () => {
    joinCalls += 1;
    await joinBehavior();
  },
};

function form(email: string, captchaToken = 'test-pass') {
  const data = new FormData();
  data.set('email', email);
  data.set('captchaToken', captchaToken);
  return data;
}

describe('joinEarlyAccessAction mapping', () => {
  beforeEach(() => {
    joinCalls = 0;
    joinBehavior = async () => undefined;
  });

  it('returns the exact public success copy for a valid signup', async () => {
    await expect(handleJoinEarlyAccess(backend, form('Person@Example.com'))).resolves.toEqual({
      status: 'success',
      message:
        "You're on the list. Check your inbox for confirmation — we'll write again when Corpus is ready.",
    });
  });

  it('returns the same success for a duplicate', async () => {
    const first = await handleJoinEarlyAccess(backend, form('person@example.com'));
    const duplicate = await handleJoinEarlyAccess(backend, form('PERSON@example.com'));

    expect(duplicate).toEqual(first);
  });

  it('returns explicit invalid-email copy before calling the backend', async () => {
    await expect(handleJoinEarlyAccess(backend, form('invalid'))).resolves.toEqual({
      status: 'invalid-email',
      message: 'That address looks incomplete. Check it and try again.',
    });
    expect(joinCalls).toBe(0);
  });

  it('maps a missing CAPTCHA token to generic retry rather than an email error', async () => {
    await expect(handleJoinEarlyAccess(backend, form('person@example.com', ''))).resolves.toEqual({
      status: 'retry',
      message: "We couldn't complete that signup. Please try again.",
    });
    expect(joinCalls).toBe(0);
  });

  it.each([
    ['CAPTCHA rejection', () => new CaptchaRejectedError()],
    ['persistence failure', () => new Error('database unavailable')],
  ])('maps %s to the same generic retry state', async (_name, makeError) => {
    joinBehavior = async () => {
      throw makeError();
    };

    await expect(handleJoinEarlyAccess(backend, form('person@example.com'))).resolves.toEqual({
      status: 'retry',
      message: "We couldn't complete that signup. Please try again.",
    });
  });

  it('maps launched mode to the closed state', async () => {
    joinBehavior = async () => {
      throw new SignupClosedError();
    };

    await expect(handleJoinEarlyAccess(backend, form('person@example.com'))).resolves.toEqual({
      status: 'closed',
    });
  });
});
