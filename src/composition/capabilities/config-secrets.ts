/**
 * Adapters for the config-secrets capability are constructed here, and nowhere else — see
 * construction.adapters-only-in-capabilities.
 */
export type ConfigSecretsDeps = {};

export const provideConfigSecrets = (): ConfigSecretsDeps => ({});
