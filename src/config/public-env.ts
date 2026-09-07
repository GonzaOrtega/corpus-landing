/**
 * The deliberately narrow config subset allowed to reach client-rendered
 * output. RECAPTCHA_SITE_KEY is the only CAPTCHA value required client-side
 * (spec Task 2) — everything else server config exposes stays server-only.
 * This is a runtime boundary, not a build-time `NEXT_PUBLIC_*` inlining: call
 * it wherever a value needs to flow into props, never re-derive it from
 * `ServerConfig` on the client.
 */
export interface PublicConfig {
  recaptchaSiteKey: string | null;
}

/**
 * Typed to the one field this needs, not the full environment shape — so
 * widening what this function reads is a visible type change, not a silent
 * one-line addition to a function that already held the keys to everything.
 */
export function loadPublicConfig(env: { RECAPTCHA_SITE_KEY?: string }): PublicConfig {
  const raw = env.RECAPTCHA_SITE_KEY;
  return {
    recaptchaSiteKey: raw && raw.length > 0 ? raw : null,
  };
}

/** Local, test, and preview deployments keep the deterministic fake CAPTCHA path. */
export function productionRecaptchaSiteKey(
  deploymentEnvironment: string | undefined,
  config: PublicConfig,
): string | null {
  return deploymentEnvironment === 'production' ? config.recaptchaSiteKey : null;
}
