import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getRecaptchaToken, RecaptchaBridge } from './recaptcha-bridge';

type Listener = () => void;

interface FakeScript {
  id: string;
  async: boolean;
  src: string;
  listeners: Record<string, Listener[]>;
  addEventListener(type: string, listener: Listener): void;
  fire(type: string): void;
}

/**
 * The bridge only ever touches `document` to append one `<script>` and
 * `window.grecaptcha` once that script has loaded. Both are stubbed with just
 * the surface it uses, so the test controls when the script "loads" and what
 * Google's client returns. No browser test exercises this path: every E2E run
 * uses the fake CAPTCHA, which never renders the bridge.
 */
function fakeScript(): FakeScript {
  const listeners: Record<string, Listener[]> = {};
  return {
    id: '',
    async: false,
    src: '',
    listeners,
    addEventListener(type, listener) {
      listeners[type] = [...(listeners[type] ?? []), listener];
    },
    fire(type) {
      for (const listener of listeners[type] ?? []) listener();
    },
  };
}

function stubDocument(existing: FakeScript | null = null) {
  const appended: FakeScript[] = [];
  const created: FakeScript[] = [];
  vi.stubGlobal('document', {
    getElementById: () => existing,
    createElement: () => {
      const script = fakeScript();
      created.push(script);
      return script;
    },
    head: { append: (script: FakeScript) => appended.push(script) },
  });
  return { appended, created };
}

function stubGrecaptcha(token: string) {
  const execute = vi.fn(async () => token);
  vi.stubGlobal('window', {
    grecaptcha: { enterprise: { ready: (callback: () => void) => callback(), execute } },
  });
  return execute;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getRecaptchaToken', () => {
  it("loads Google's script for the site key once and resolves the executed token", async () => {
    const { appended, created } = stubDocument();
    const execute = stubGrecaptcha('token-123');

    const pending = getRecaptchaToken('site key/with?chars');
    expect(appended).toHaveLength(1);
    expect(created[0]).toMatchObject({
      id: 'google-recaptcha-enterprise',
      async: true,
      src: 'https://www.google.com/recaptcha/enterprise.js?render=site%20key%2Fwith%3Fchars',
    });
    created[0]?.fire('load');

    await expect(pending).resolves.toBe('token-123');
    expect(execute).toHaveBeenCalledWith('site key/with?chars', { action: 'early_access_signup' });
  });

  it('reuses an already-present script instead of appending a second one', async () => {
    const existing = fakeScript();
    const { appended } = stubDocument(existing);
    stubGrecaptcha('token-456');

    await expect(getRecaptchaToken('site-key')).resolves.toBe('token-456');
    expect(appended).toHaveLength(0);
  });

  it('waits for a present-but-still-loading script before executing', async () => {
    const existing = fakeScript();
    stubDocument(existing);
    vi.stubGlobal('window', {});

    const pending = getRecaptchaToken('site-key');
    stubGrecaptcha('token-789');
    existing.fire('load');

    await expect(pending).resolves.toBe('token-789');
  });

  it('rejects when a present-but-still-loading script fails', async () => {
    const existing = fakeScript();
    stubDocument(existing);
    vi.stubGlobal('window', {});

    const pending = getRecaptchaToken('site-key');
    existing.fire('error');

    await expect(pending).rejects.toThrow('CAPTCHA failed to load');
  });

  it('rejects when the script fails to load', async () => {
    const { created } = stubDocument();
    vi.stubGlobal('window', {});

    const pending = getRecaptchaToken('site-key');
    created[0]?.fire('error');

    await expect(pending).rejects.toThrow('CAPTCHA failed to load');
  });

  it('rejects when the script loads but exposes no enterprise client', async () => {
    const { created } = stubDocument();
    vi.stubGlobal('window', {});

    const pending = getRecaptchaToken('site-key');
    created[0]?.fire('load');

    await expect(pending).rejects.toThrow('CAPTCHA is unavailable');
  });
});

describe('RecaptchaBridge', () => {
  it('renders nothing on the server; the script is loaded in an effect', () => {
    expect(renderToStaticMarkup(createElement(RecaptchaBridge, { siteKey: 'site-key' }))).toBe('');
  });
});
