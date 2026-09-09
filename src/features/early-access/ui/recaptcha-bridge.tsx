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

export async function getRecaptchaToken(siteKey: string): Promise<string> {
  await loadRecaptchaScript(siteKey);
  const recaptcha = window.grecaptcha;
  if (!recaptcha?.enterprise) throw new Error('CAPTCHA is unavailable');
  const captcha = recaptcha.enterprise;

  return new Promise((resolve) => {
    captcha.ready(() => {
      void captcha.execute(siteKey, { action: 'early_access_signup' }).then(resolve);
    });
  });
}
