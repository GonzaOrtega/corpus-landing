'use client';

import { useEffect } from 'react';

declare global {
  interface Window {
    grecaptcha?: {
      enterprise?: {
        execute(siteKey: string, options: { action: string }): Promise<string>;
        ready(callback: () => void): void;
      };
    };
  }
}

const scriptId = 'google-recaptcha-enterprise';

function loadRecaptchaScript(siteKey: string): Promise<void> {
  const existing = document.getElementById(scriptId);
  if (existing) {
    return new Promise((resolve, reject) => {
      const recaptcha = window.grecaptcha;
      if (recaptcha?.enterprise) resolve();
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('CAPTCHA failed to load')), {
        once: true,
      });
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.id = scriptId;
    script.async = true;
    script.src = `https://www.google.com/recaptcha/enterprise.js?render=${encodeURIComponent(siteKey)}`;
    script.addEventListener('load', () => resolve(), { once: true });
    script.addEventListener('error', () => reject(new Error('CAPTCHA failed to load')), {
      once: true,
    });
    document.head.append(script);
  });
}

/** Loads Google's client code only when a production-only site key was provided by the server. */
export function RecaptchaBridge({ siteKey }: { siteKey: string }) {
  useEffect(() => {
    void loadRecaptchaScript(siteKey).catch(() => undefined);
  }, [siteKey]);

  return null;
}

/**
 * How long to wait for Google before giving up on a token (R-26). Both of the
 * calls below can stall without ever failing: `execute` can reject, and
 * `ready` can simply never invoke its callback. Either one used to leave this
 * promise permanently unsettled, and `signup-form.tsx` awaits it *before*
 * `startTransition`, so the submit never started, the form's catch never ran,
 * and the pending state never appeared — the visitor clicked Join and got
 * nothing at all until they reloaded. Rejecting is what lets the form fall
 * back to an empty token, which the server refuses cleanly and reports.
 */
const tokenTimeoutMs = 10_000;

export async function getRecaptchaToken(siteKey: string): Promise<string> {
  await loadRecaptchaScript(siteKey);
  const recaptcha = window.grecaptcha;
  if (!recaptcha?.enterprise) throw new Error('CAPTCHA is unavailable');
  const captcha = recaptcha.enterprise;

  return new Promise((resolve, reject) => {
    // Started before `ready`, not inside it, so a `ready` that never fires is
    // covered as well as an `execute` that rejects.
    const timeout = setTimeout(() => reject(new Error('CAPTCHA timed out')), tokenTimeoutMs);

    captcha.ready(() => {
      void captcha.execute(siteKey, { action: 'early_access_signup' }).then(
        (token) => {
          clearTimeout(timeout);
          resolve(token);
        },
        () => {
          clearTimeout(timeout);
          // Deliberately no `cause`: the rejection reason is provider output,
          // and this repo does not put provider response bodies anywhere they
          // could later be logged.
          reject(new Error('CAPTCHA is unavailable'));
        },
      );
    });
  });
}
