import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getRecaptchaToken, RecaptchaBridge } from './recaptcha-bridge';

/**
 * R-11: this file was excluded from coverage under a comment naming
 * `signup.spec.ts` as its browser cover. `signup.spec.ts` never mentions
 * "captcha" at all, and the Playwright suite always runs with
 * `CORPUS_FAKE_CAPTCHA=1` (compose.yaml, playwright.config.ts) — which
 * `productionRecaptchaSiteKey` (src/config/public-env.ts) turns into a
 * `null` site key, so `<SignupForm>` never renders `<RecaptchaBridge>` and
 * never calls `getRecaptchaToken` there. `preview-safety.spec.ts`'s only
 * assertion about it proves the opposite of coverage: that the script is
 * ABSENT. Script injection, script-tag reuse, the load/error handlers and
 * the "CAPTCHA is unavailable" failure path had no test of any kind. This
 * repo has no jsdom/testing-library layer by decision, so `document` and
 * `window` are stubbed by hand here — the same pattern
 * `tests/unit/instrumentation-client.test.ts` uses for the same reason.
 */

const scriptId = 'google-recaptcha-enterprise';

class FakeScriptElement {
  id = '';
  async = false;
  src = '';
  private readonly listeners = new Map<string, Array<() => void>>();

  addEventListener(type: string, handler: () => void): void {
    const handlers = this.listeners.get(type) ?? [];
    handlers.push(handler);
    this.listeners.set(type, handlers);
  }

  removeEventListener(): void {}

  dispatch(type: string): void {
    for (const handler of this.listeners.get(type) ?? []) handler();
  }
}

function stubDom({ existingScript }: { existingScript?: FakeScriptElement } = {}) {
  const appended: FakeScriptElement[] = [];
  const createdElements: FakeScriptElement[] = [];
  vi.stubGlobal('document', {
    getElementById: vi.fn((id: string) => (id === scriptId ? (existingScript ?? null) : null)),
    createElement: vi.fn(() => {
      const element = new FakeScriptElement();
      createdElements.push(element);
      return element;
    }),
    head: { append: vi.fn((element: FakeScriptElement) => appended.push(element)) },
  });
  return { appended, createdElements };
}

function stubGrecaptcha(overrides: {
  ready?: (callback: () => void) => void;
  execute?: (siteKey: string, options: { action: string }) => Promise<string>;
}) {
  const ready = overrides.ready ?? ((callback: () => void) => callback());
  const execute = overrides.execute ?? (async () => 'recaptcha-token');
  vi.stubGlobal('window', { grecaptcha: { enterprise: { ready, execute } } });
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/**
 * `getRecaptchaToken` arms its timeout only after `await loadRecaptchaScript`
 * settles, so the clock must not be advanced until that has happened. Bounded
 * rather than a fixed tick count, so it does not silently depend on how many
 * microtasks that await currently takes.
 */
async function waitForArmedTimeout(): Promise<void> {
  for (let i = 0; i < 50 && vi.getTimerCount() === 0; i += 1) await Promise.resolve();
  expect(vi.getTimerCount()).toBe(1);
}

describe('getRecaptchaToken — script injection', () => {
  it('creates the Enterprise script with the right id, src and async flag, then resolves after it loads', async () => {
    const { appended, createdElements } = stubDom();
    stubGrecaptcha({});

    const pending = getRecaptchaToken('site-key-123');
    expect(createdElements).toHaveLength(1);
    const script = createdElements[0];
    expect(appended).toEqual([script]);
    expect(script.id).toBe(scriptId);
    expect(script.async).toBe(true);
    expect(script.src).toBe('https://www.google.com/recaptcha/enterprise.js?render=site-key-123');

    script.dispatch('load');

    await expect(pending).resolves.toBe('recaptcha-token');
  });

  it('encodes a site key that needs escaping into the script URL', async () => {
    const { createdElements } = stubDom();
    stubGrecaptcha({});

    const pending = getRecaptchaToken('site key/with special+chars');
    const script = createdElements[0];
    expect(script.src).toBe(
      `https://www.google.com/recaptcha/enterprise.js?render=${encodeURIComponent('site key/with special+chars')}`,
    );

    script.dispatch('load');
    await pending;
  });

  it('rejects with "CAPTCHA failed to load" when the new script fires an error event', async () => {
    const { createdElements } = stubDom();
    stubGrecaptcha({});

    const pending = getRecaptchaToken('site-key-123');
    createdElements[0].dispatch('error');

    await expect(pending).rejects.toThrow('CAPTCHA failed to load');
  });
});

describe('getRecaptchaToken — reusing an already-present script tag', () => {
  it('resolves immediately, without creating a second script, when grecaptcha.enterprise is already ready', async () => {
    const existingScript = new FakeScriptElement();
    const { createdElements } = stubDom({ existingScript });
    stubGrecaptcha({});

    await expect(getRecaptchaToken('site-key-123')).resolves.toBe('recaptcha-token');
    expect(createdElements).toHaveLength(0);
  });

  it('waits for the existing script’s load event when grecaptcha is not ready yet', async () => {
    const existingScript = new FakeScriptElement();
    const { createdElements } = stubDom({ existingScript });
    // No grecaptcha yet: `loadRecaptchaScript`'s executor reads `window.grecaptcha`
    // synchronously, before this call returns, so it must be missing here to
    // force the listener-based branch rather than the immediate resolve.
    vi.stubGlobal('window', {});

    const pending = getRecaptchaToken('site-key-123');
    // Now it becomes available, same as the real script finishing its own
    // setup work before firing `load`.
    stubGrecaptcha({});
    existingScript.dispatch('load');

    await expect(pending).resolves.toBe('recaptcha-token');
    expect(createdElements).toHaveLength(0);
  });

  it('rejects with "CAPTCHA failed to load" when the existing script fires an error event', async () => {
    const existingScript = new FakeScriptElement();
    stubDom({ existingScript });
    vi.stubGlobal('window', {});

    const pending = getRecaptchaToken('site-key-123');
    existingScript.dispatch('error');

    await expect(pending).rejects.toThrow('CAPTCHA failed to load');
  });
});

describe('getRecaptchaToken — the anti-abuse failure path', () => {
  it('throws "CAPTCHA is unavailable" when the script loads but grecaptcha.enterprise never showed up', async () => {
    const { createdElements } = stubDom();
    vi.stubGlobal('window', {});

    const pending = getRecaptchaToken('site-key-123');
    createdElements[0].dispatch('load');

    await expect(pending).rejects.toThrow('CAPTCHA is unavailable');
  });
});

describe('getRecaptchaToken — token derivation', () => {
  it('waits for grecaptcha.ready before calling execute with the site key and the signup action', async () => {
    const { createdElements } = stubDom();
    const execute = vi.fn(async () => 'derived-token');
    let readyCallback: (() => void) | undefined;
    stubGrecaptcha({
      ready: (callback) => {
        readyCallback = callback;
      },
      execute,
    });

    const pending = getRecaptchaToken('site-key-123');
    createdElements[0].dispatch('load');
    await vi.waitFor(() => expect(readyCallback).toBeDefined());
    expect(execute).not.toHaveBeenCalled();

    readyCallback?.();

    await expect(pending).resolves.toBe('derived-token');
    expect(execute).toHaveBeenCalledWith('site-key-123', { action: 'early_access_signup' });
  });
});

describe('getRecaptchaToken — R-26: it never leaves the caller waiting forever', () => {
  // Before this, the returned promise had no reject path at all: `execute`'s
  // rejection was discarded by `void ... .then(resolve)` and `ready` never
  // firing was not covered either. Because `signup-form.tsx` awaits this
  // inside a try/catch and only calls `startTransition` afterwards, an
  // unsettled promise meant the catch never ran, the pending state never
  // appeared, and Join did nothing at all until the visitor reloaded.
  it('rejects when Google refuses the assessment, instead of hanging', async () => {
    const existingScript = new FakeScriptElement();
    stubDom({ existingScript });
    stubGrecaptcha({ execute: () => Promise.reject(new Error('quota exceeded')) });

    await expect(getRecaptchaToken('site-key-123')).rejects.toThrow('CAPTCHA is unavailable');
  });

  it('does not carry the provider’s own rejection reason on the error it raises', async () => {
    const existingScript = new FakeScriptElement();
    stubDom({ existingScript });
    stubGrecaptcha({
      execute: () => Promise.reject(new Error('quota exceeded for project 1234')),
    });

    const error = await getRecaptchaToken('site-key-123').catch((reason: unknown) => reason);

    // The threat model forbids provider response bodies reaching anywhere they
    // could be logged, so neither the message nor `cause` may relay it.
    expect(String(error)).not.toContain('quota exceeded');
    expect(String(error)).not.toContain('1234');
    expect((error as Error).cause).toBeUndefined();
  });

  it('rejects when grecaptcha.ready never invokes its callback', async () => {
    vi.useFakeTimers();
    const existingScript = new FakeScriptElement();
    stubDom({ existingScript });
    // A `ready` that accepts the callback and then does nothing with it: the
    // shape of an SDK that loaded but never became usable.
    stubGrecaptcha({ ready: () => undefined });

    const pending = getRecaptchaToken('site-key-123');
    const assertion = expect(pending).rejects.toThrow('CAPTCHA timed out');
    await waitForArmedTimeout();
    // Mirrors `tokenTimeoutMs` in the source; change both together.
    await vi.advanceTimersByTimeAsync(10_000);

    await assertion;
  });

  it('clears the timeout once a token arrives, so a later tick cannot reject a settled call', async () => {
    vi.useFakeTimers();
    const existingScript = new FakeScriptElement();
    stubDom({ existingScript });
    stubGrecaptcha({});

    await expect(getRecaptchaToken('site-key-123')).resolves.toBe('recaptcha-token');

    // Falsifiable: dropping `clearTimeout` from the success path leaves this at 1.
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('RecaptchaBridge', () => {
  it('renders nothing — it only exists to trigger the load effect', () => {
    const html = renderToStaticMarkup(<RecaptchaBridge siteKey="site-key-123" />);

    expect(html).toBe('');
  });
});
